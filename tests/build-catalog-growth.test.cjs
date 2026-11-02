'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

test('la préparation accepte un nouveau Chef, vérifie ses images et renouvelle les ressources modifiées',()=>{
  const root=path.resolve(__dirname,'..');
  const fixtureRoot=path.join(root,'runtime');fs.mkdirSync(fixtureRoot,{recursive:true});
  const fixture=fs.mkdtempSync(path.join(fixtureRoot,'mh-tcg-builder-'));
  try{
    fs.cpSync(path.join(root,'dist'),path.join(fixture,'dist'),{recursive:true,filter:file=>!path.relative(path.join(root,'dist'),file).split(path.sep).includes('.openai')});
    fs.mkdirSync(path.join(fixture,'scripts'));
    fs.copyFileSync(path.join(root,'scripts','build.cjs'),path.join(fixture,'scripts','build.cjs'));
    fs.copyFileSync(path.join(root,'package.json'),path.join(fixture,'package.json'));
    const build=()=>execFileSync(process.execPath,['scripts/build.cjs'],{cwd:fixture,encoding:'utf8',stdio:['ignore','pipe','pipe']});
    const readHtml=()=>fs.readFileSync(path.join(fixture,'dist','index.html'),'utf8');
    build();const html=readHtml();build();assert.equal(readHtml(),html,'Deux préparations identiques doivent garder les mêmes adresses de ressources.');
    const catalog=JSON.parse(JSON.stringify(require('../dist/catalog.js')));
    const originalCount=catalog.cards.length;
    const chief=catalog.cards.find(card=>card.type==='chief');
    const used=new Set(catalog.cards.map(card=>card.id));
    const newId=Array.from({length:999},(_,index)=>String(index+1).padStart(3,'0')).find(id=>!used.has(id));
    assert(newId,'Le test demande un identifiant disponible.');
    catalog.cards.push({...chief,id:newId,name:'Chef de test du futur',nameEn:'Future Test Chief',image:'assets/cards/'+newId+'.webp',sourceImage:'MhFG_'+newId+'_fr.png'});
    const writeCatalog=()=>fs.writeFileSync(path.join(fixture,'dist','catalog.js'),'module.exports='+JSON.stringify(catalog)+';\n');
    writeCatalog();
    assert.throws(build,error=>String(error.stderr).includes(newId), 'Une illustration manquante doit empêcher la publication.');
    fs.copyFileSync(path.join(fixture,'dist',chief.image),path.join(fixture,'dist','assets','cards',newId+'.webp'));
    fs.copyFileSync(path.join(fixture,'dist','assets','cards','en',path.basename(chief.image)),path.join(fixture,'dist','assets','cards','en',newId+'.webp'));
    build();
    const metadata=JSON.parse(fs.readFileSync(path.join(fixture,'dist','version.json'),'utf8'));
    assert.equal(metadata.counts.chiefs,catalog.cards.filter(card=>card.type==='chief').length);
    assert.equal(metadata.counts.images,(originalCount+1)*2);
    const stylesheetVersion=()=>readHtml().match(/site\.css\?v=([a-f0-9]+)/)[1];
    const previous=stylesheetVersion();fs.appendFileSync(path.join(fixture,'dist','site.css'),'\n/* Test de modification de style. */\n');build();
    assert.notEqual(stylesheetVersion(),previous,'Une ressource modifiée doit recevoir une nouvelle adresse.');
    catalog.cards.push({...chief});writeCatalog();
    assert.throws(build,error=>String(error.stderr).includes('identifiants en double'));
  }finally{
    const target=fs.realpathSync(fixture),parent=fs.realpathSync(fixtureRoot);
    if(path.dirname(target)!==parent||!path.basename(target).startsWith('mh-tcg-builder-'))throw Error('Dossier temporaire inattendu : nettoyage refusé.');
    fs.rmSync(target,{recursive:true,force:true});
  }
});
