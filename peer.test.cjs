'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../dist/peer.js');
const {PeerSession, encodeSignal, decodeSignal, redactState, rtcConfiguration} = P;

function mockNetwork(options = {}) {
  let nextId = 1; const pcs = new Map();
  class MockChannel {
    constructor(label) { this.label = label; this.protocol = 'mh-tcg/1'; this.readyState = 'connecting'; this.bufferedAmount = 0; this.sent = []; }
    send(data) { if(this.readyState !== 'open') throw Error('closed'); this.sent.push(data); this.other.onmessage?.({data}); }
    close() { this.readyState = 'closed'; }
  }
  class MockPC {
    constructor(config) { this.id = nextId++; pcs.set(this.id, this); this.config = config; this.iceGatheringState = 'complete'; this.connectionState = 'new'; this.sctp = {maxMessageSize: 524288}; this.localDescription = null; }
    createDataChannel(label,options) { this.channel = new MockChannel(label); this.channelOptions = options; return this.channel; }
    async createOffer() { return {type:'offer',sdp:`v=0\r\na=x-mock:${this.id}\r\na=candidate:1 1 udp 2122260223 192.0.2.1 50001 typ host\r\n`}; }
    async createAnswer() { return {type:'answer',sdp:`v=0\r\na=x-mock:${this.id}\r\na=candidate:1 1 udp 2122260223 192.0.2.2 50002 typ host\r\n`}; }
    async setLocalDescription(d) { this.localDescription = d; }
    async setRemoteDescription(d) {
      this.remoteDescription = d; const remoteId = Number(/a=x-mock:(\d+)/.exec(d.sdp)[1]); this.remote = pcs.get(remoteId);
      if(d.type === 'answer') {
        const guest = this.remote;
        const guestChannel = new MockChannel(this.channel.label); this.channel.other = guestChannel; guestChannel.other = this.channel; guest.channel = guestChannel;
        guest.ondatachannel?.({channel: guestChannel});
        if (options.open !== false) {
          this.channel.readyState = guestChannel.readyState = 'open';
          this.connectionState = guest.connectionState = 'connected';
          this.channel.onopen?.(); guestChannel.onopen?.();
        }
      }
    }
    close() { this.connectionState = 'closed'; }
    addEventListener() {}
    removeEventListener() {}
  }
  return {factory:config=>new MockPC(config),pcs};
}
async function connectedPeers(options = {}) {
  const network = mockNetwork(), hostMessages = [], guestMessages = [], statuses = [];
  const host = new PeerSession({rtcFactory: network.factory,onMessage:x=>hostMessages.push(x),onStatus:(s,l)=>statuses.push([s,l])});
  const guest = new PeerSession({rtcFactory: network.factory,onMessage:x=>guestMessages.push(x)});
  const invitation = await host.createOffer(options);
  const answer = await guest.acceptOffer(invitation, options);
  await host.acceptAnswer(answer);
  return {host,guest,network,hostMessages,guestMessages,statuses,invitation,answer};
}
const signal = (kind='offer',extra={}) => ({protocol:'mh-tcg-p2p',version:1,kind,sessionId:'a'.repeat(32),createdAt:Date.now(),description:{type:kind,sdp:'v=0\r\na=test:1\r\n'},...extra});
const encodeRaw = value => 'MHTCG1.' + Buffer.from(JSON.stringify(value)).toString('base64url');

test('codes de connexion : aller-retour, espaces de copie et séparation offre/réponse', () => {
  const input = signal(); const code = encodeSignal(input);
  assert.equal(decodeSignal(code,'offer').sessionId,input.sessionId);
  assert.equal(decodeSignal(`\n ${code.slice(0,40)}\n${code.slice(40)} `,'offer').description.sdp,input.description.sdp);
  assert.throws(()=>decodeSignal(code,'answer'),/réponse/);
  assert.throws(()=>decodeSignal('une invitation inconnue'),/code de connexion/);
});
test('codes invalides, expirés, hors version et trop volumineux refusés', () => {
  assert.throws(()=>decodeSignal(encodeRaw(signal('offer',{version:2}))),/version/);
  assert.throws(()=>decodeSignal(encodeRaw(signal('offer',{createdAt:Date.now()-31*60*1000}))),/expiré/);
  assert.throws(()=>decodeSignal(encodeRaw(signal('offer',{sessionId:'fake'}))),/identifiant/);
  assert.throws(()=>decodeSignal('MHTCG1.%bad'),/incomplet|invalide/);
  assert.throws(()=>decodeSignal('MHTCG1.'+'a'.repeat(140000)),/volumineux/);
  assert.throws(()=>encodeSignal(signal('offer',{description:{type:'offer',sdp:'v=0\r\n'+'x'.repeat(96000)}})),/description/);
});
test('configuration LAN sans STUN, Internet avec STUN, relais optionnel non persistant', () => {
  assert.deepEqual(rtcConfiguration({mode:'lan'}).iceServers,[]);
  assert.match(rtcConfiguration({mode:'internet'}).iceServers[0].urls,/^stun:/);
  const relay = {urls:'turns:relay.example:5349',username:'u',credential:'secret'};
  assert.equal(rtcConfiguration({mode:'internet',turn:relay}).iceServers[1].credential,'secret');
  assert.equal(rtcConfiguration({mode:'internet'}).iceServers.length,1);
  assert.throws(()=>rtcConfiguration({turn:{urls:'https://example.test',username:'u',credential:'s'}}),/TURN/);
});
test('deux pairs établissent un canal ordonné et échangent des messages de partie', async () => {
  const t = await connectedPeers({mode:'lan'});
  assert.equal(t.host.isHost,true); assert.equal(t.guest.isHost,false);
  assert.equal(t.host.sessionId,t.guest.sessionId); assert(t.host.connected && t.guest.connected);
  assert.deepEqual(t.network.pcs.get(1).channelOptions,{ordered:true,protocol:'mh-tcg/1'});
  t.host.send({type:'state',state:{turn:1}}); t.guest.send({type:'intent',action:{type:'pass'}});
  assert.deepEqual(t.guestMessages,[{type:'state',state:{turn:1}}]);
  assert.deepEqual(t.hostMessages,[{type:'intent',action:{type:'pass'}}]);
  assert(t.statuses.some(([status])=>status==='awaiting-answer'));
  await assert.rejects(t.host.acceptAnswer(t.answer),/invitation/);
  t.host.close(); t.guest.close();
});
test('réponse d’une autre invitation refusée sans détruire la tentative courante', async () => {
  const n=mockNetwork(),host=new PeerSession({rtcFactory:n.factory});
  await host.createOffer({mode:'lan'});
  await assert.rejects(host.acceptAnswer(encodeSignal(signal('answer'))),/autre invitation/);
  assert.equal(host.status,'awaiting-answer'); host.close();
});
test('envoi avant connexion, surcharge et dépassement du message refusés sans consommer de séquence', async () => {
  const idle=new PeerSession(); assert.throws(()=>idle.send({type:'x'}),/pas encore ouverte/); idle.close();
  const t=await connectedPeers({mode:'lan'}),channel=t.network.pcs.get(1).channel;
  channel.bufferedAmount=2000000; assert.throws(()=>t.host.send({type:'busy'}),/occupée/);
  channel.bufferedAmount=0; assert.throws(()=>t.host.send({type:'huge',text:'x'.repeat(530000)}),/volumineux/);
  t.host.send({type:'valid'});
  assert.equal(JSON.parse(channel.sent[0]).seq,1); assert.equal(t.guestMessages.length,1);
  t.host.close();t.guest.close();
});
test('rejeu ou message hors ordre ferme le canal et ne livre pas le message', async () => {
  const t=await connectedPeers({mode:'lan'}),channel=t.network.pcs.get(1).channel;
  t.host.send({type:'first'}); const replay=channel.sent[0];
  channel.other.onmessage({data:replay});
  assert.equal(t.guestMessages.length,1); assert.equal(t.guest.status,'failed');
  assert.equal(t.guest.connected,false); t.host.close();t.guest.close();
});
test('version, session et JSON invalides sont rejetés avant onMessage', async t => {
  for(const variant of ['version','session','json','oversize','payload']) await t.test(variant,async()=>{
    const pair=await connectedPeers({mode:'lan'}),incoming=pair.network.pcs.get(2).channel;
    const packet={protocol:'mh-tcg-p2p',version:1,sessionId:pair.host.sessionId,seq:1,payload:{type:'x'}};
    if(variant==='version')packet.version=2;
    if(variant==='session')packet.sessionId='b'.repeat(32);
    if(variant==='payload')packet.payload=JSON.parse('{"__proto__":{"admin":true}}');
    const data=variant==='json'?'{broken':variant==='oversize'?'x'.repeat(524289):JSON.stringify(packet);
    incoming.onmessage({data}); assert.equal(pair.guestMessages.length,0);assert.equal(pair.guest.status,'failed');
    pair.host.close();pair.guest.close();
  });
});
test('une fermeture annule une collecte ICE et les anciens callbacks ne ressuscitent pas la session', async()=>{
  const n=mockNetwork(); const factory=config=>{const pc=n.factory(config);pc.iceGatheringState='gathering';return pc;};
  const host=new PeerSession({rtcFactory:factory});const pending=host.createOffer({mode:'lan'});
  await Promise.resolve();await Promise.resolve();host.close();
  await assert.rejects(pending,/annulée/);assert.equal(host.status,'closed');assert.equal(host.connected,false);
});
test('aucun code inutilisable n’est produit si le navigateur ne fournit aucun candidat ICE', async()=>{
  const n=mockNetwork(),factory=config=>{const pc=n.factory(config);pc.createOffer=async()=>({type:'offer',sdp:`v=0\r\na=x-mock:${pc.id}\r\na=end-of-candidates\r\n`});return pc;};
  const host=new PeerSession({rtcFactory:factory});
  await assert.rejects(host.createOffer({mode:'lan'}),/aucune adresse.*Internet/);
  assert.equal(host.status,'failed');assert.equal(host.connected,false);
  const validHost=new PeerSession({rtcFactory:n.factory}),offer=await validHost.createOffer({mode:'lan'});
  const guestFactory=config=>{const pc=n.factory(config);pc.createAnswer=async()=>({type:'answer',sdp:`v=0\r\na=x-mock:${pc.id}\r\n`});return pc;};
  const guest=new PeerSession({rtcFactory:guestFactory});
  await assert.rejects(guest.acceptOffer(offer,{mode:'internet'}),/aucune adresse/);
  assert.equal(guest.status,'failed');validHost.close();host.close();guest.close();
});
test('l’hôte attend une réponse sans délai de connexion ; après acceptation son délai est distinct de celui de l’invité', async()=>{
  const n=mockNetwork({open:false});
  const host=new PeerSession({rtcFactory:n.factory,hostConnectTimeoutMs:20});
  const guest=new PeerSession({rtcFactory:n.factory,guestConnectTimeoutMs:200});
  const offer=await host.createOffer({mode:'lan'}),answer=await guest.acceptOffer(offer,{mode:'lan'});
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(host.status,'awaiting-answer');assert.equal(guest.status,'awaiting-host');
  await host.acceptAnswer(answer);assert.equal(host.status,'connecting');
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(host.status,'failed');assert.equal(guest.status,'awaiting-host');
  host.close();guest.close();
});
test('l’attente de finalisation de l’invité expire séparément et se nettoie', async()=>{
  const n=mockNetwork({open:false}),host=new PeerSession({rtcFactory:n.factory}),guest=new PeerSession({rtcFactory:n.factory,guestConnectTimeoutMs:20});
  const offer=await host.createOffer({mode:'lan'});await guest.acceptOffer(offer,{mode:'lan'});
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(host.status,'awaiting-answer');assert.equal(guest.status,'failed');
  host.close();guest.close();
});
test('la vue autorisée masque les mains adverses et tous les decks sans modifier l’état',()=>{
  const E=require('../dist/engine.js'),C=require('../dist/catalog.js');const state=E.createScenario(C);
  state.players[0].hand[0].computedStats={force:3,hp:4,remainingHp:3,armor:1,private:'forbidden'};
  state.log.push({text:'La carte cachée est secret-123',turn:1});
  state.log.push({text:'Le combat se termine.',turn:1,public:true});
  state.secret='not-allowed';state.pending={player:0,label:'Choisissez la carte secrète',entry:{sourceSnapshot:{cardId:'secret-123'}},targets:[{id:'secret'}]};
  state.stack.push({uid:'e-public',kind:'ability',label:'Capacité annoncée',player:0,sourceId:'c-public',sourceCardId:'011',sourceSnapshot:{secret:'secret-123'}});
  const before=JSON.stringify(state),guest=redactState(state,1,C);
  assert.equal(JSON.stringify(state),before);
  assert.equal(guest.players[0].hand.length,state.players[0].hand.length);
  assert(guest.players[0].hand.every(c=>c.hidden&&c.uid===null&&!c.cardId));
  assert(guest.players.every(p=>p.deck.every(c=>c.hidden&&c.uid===null&&!c.cardId)));
  assert.equal(guest.players[1].hand[0].cardId,state.players[1].hand[0].cardId);
  assert.equal(guest.pending.label,'L’adversaire effectue un choix.');
  assert(!('entry' in guest.pending));assert(!('targets' in guest.pending));
  assert(!('sourceSnapshot' in guest.stack.at(-1)));
  assert(!('seed' in guest));assert(!('triggers' in guest));assert(!('decisions' in guest));assert(!('secret' in guest));
  assert(!JSON.stringify(guest).includes('secret-123'));
  assert.deepEqual(guest.log,state.log.filter(event=>event.public===true).map(event=>({turn:event.turn,text:event.text})));
  const host=redactState(state,0,C);
  assert.deepEqual(host.players[0].hand[0].computedStats,{force:3,hp:4,remainingHp:3,armor:1});
  assert.throws(()=>redactState(state,2),/invalide/);
});

test('la progression publique du tour conserve seulement les étapes connues et ne révèle aucun état caché',()=>{
  const E=require('../dist/engine.js'),C=require('../dist/catalog.js'),state=E.createScenario(C);
  state.phase='response';state.secret='SECRET-STATE';state.triggers=[{secret:'SECRET-TRIGGER'}];
  state.decisions=[{secret:'SECRET-DECISION'}];
  for(const flow of ['setup','start','main','combat','end',undefined,null,42,'SECRET-FLOW',{secret:'SECRET-FLOW'}]){
    state.flow=flow;const before=JSON.stringify(state);
    for(const viewer of [0,1]){
      const view=redactState(state,viewer),text=JSON.stringify(view);
      assert.equal(view.phase,'response');
      assert.equal(view.flow,['setup','start','main','combat','end'].includes(flow)?flow:'');
      assert(!text.includes('SECRET-'));
      for(const card of [...state.players[1-viewer].hand,...state.players.flatMap(player=>player.deck)])assert(!text.includes('"'+card.uid+'"'));
      assert(view.players[1-viewer].hand.every(card=>card.hidden&&card.uid===null&&!card.cardId));
      assert(view.players.every(player=>player.deck.every(card=>card.hidden&&card.uid===null&&!card.cardId)));
    }
    assert.equal(JSON.stringify(state),before);
  }
});
