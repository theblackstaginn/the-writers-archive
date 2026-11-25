import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
(function(){
"use strict";
var SUPABASE_URL="https://pqifpislzljilqatmtly.supabase.co",SUPABASE_KEY="sb_publishable_16wAhIyuMsClbOYoAZt6aQ_unXWTJ_n";
var supabaseClient=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
var KEY="writers-archive-v2",PENDING_KEY="writers-archive-pending-v2",LAST_SYNC_KEY="writers-archive-sync-stamp-v2",LEGACY_KEY="writers-archive-v1",LEGACY_IMPORTED_KEY="writers-archive-legacy-imported-v2",view="write",timer=0,toastTimer=0,cloudTimer=0,mode="",parentId="",editId="";
var currentUser=null,cloudReady=false,cloudStamp=null,cloudInFlight=false,cloudQueueAgain=false,localGeneration=0,loadedUserId=null,loadingUserId=null;
var $=function(id){return document.getElementById(id);},editor=$("editor"),dialog=$("entryDialog"),deleteDialog=$("deleteDialog"),wordDialog=$("wordLookup"),importDialog=$("importDialog"),pendingDelete=null,rememberedWord="",rememberedRange=null,wordLookupController=null,wordLookupRequest=0,loadedMammoth=null,pendingDocxImport=null,importRequest=0;
function id(){return window.crypto&&crypto.randomUUID?crypto.randomUUID():"a"+Date.now().toString(36)+Math.random().toString(36).slice(2);}
function scene(title){return{id:id(),title:title||"New Section",content:"<p></p>"};}
function book(title){var ch={id:id(),title:"Chapter One",scenes:[scene("First Section")]};return{id:id(),title:title||"Untitled Manuscript",chapters:[ch]};}
function fresh(){var b=book("Untitled Manuscript");return{books:[b],subjects:[],places:[],notes:[],sources:[],bookId:b.id,chapterId:b.chapters[0].id,sceneId:b.chapters[0].scenes[0].id};}
function cleanHtml(value){var doc=new DOMParser().parseFromString(String(value||""),"text/html"),ok=new Set(["P","BR","B","STRONG","I","EM","U","S","UL","OL","LI","H1","H2","H3","BLOCKQUOTE","DIV","A"]);function walk(p){Array.from(p.childNodes).forEach(function(n){if(n.nodeType===3)return;if(n.nodeType!==1){n.remove();return;}if(!ok.has(n.tagName)){var f=document.createDocumentFragment();while(n.firstChild)f.appendChild(n.firstChild);n.replaceWith(f);walk(p);return;}Array.from(n.attributes).forEach(function(a){if(n.tagName==="A"&&a.name==="href"&&/^(https?:|mailto:)/i.test(a.value))return;n.removeAttribute(a.name);});if(n.tagName==="A"&&n.hasAttribute("href"))n.rel="noopener noreferrer";walk(n);});}walk(doc.body);return doc.body.innerHTML;}
function normalize(x){if(!x||!Array.isArray(x.books))throw new Error("Invalid backup");x.books=x.books.map(function(b){b.chapters=Array.isArray(b.chapters)?b.chapters:[];if(!b.chapters.length)b.chapters.push({id:id(),title:"Chapter One",scenes:[scene("First Section")]});b.chapters.forEach(function(c){c.scenes=Array.isArray(c.scenes)?c.scenes:[];if(!c.scenes.length)c.scenes.push(scene("First Section"));c.scenes.forEach(function(s){s.content=cleanHtml(s.content);var empty=!txt(s.content);if(empty){if(s.title==="First Scene")s.title="First Section";else if(s.title==="New Scene")s.title="New Section";else if(s.title==="Untitled Scene")s.title="Untitled Section";}});});b.title=String(b.title||"Untitled Manuscript");return b;});var subjects=Array.isArray(x.subjects)?x.subjects.slice():[];(Array.isArray(x.characters)?x.characters:[]).forEach(function(old){if(!old.id||!subjects.some(function(item){return item.id===old.id;}))subjects.push(old);});x.subjects=subjects;delete x.characters;["places","notes","sources"].forEach(function(k){if(!Array.isArray(x[k]))x[k]=[];});return x;}
function hasLegacySceneTitles(archive){return !!(archive&&Array.isArray(archive.books)&&archive.books.some(function(b){return Array.isArray(b.chapters)&&b.chapters.some(function(c){return Array.isArray(c.scenes)&&c.scenes.some(function(s){return ["First Scene","New Scene","Untitled Scene"].includes(s.title)&&!txt(s.content);});});}));}
function accountKey(key,userId){return key+"-"+(userId||"signed-out");}
function readLocalArchive(userId){try{var raw=localStorage.getItem(accountKey(KEY,userId));if(!raw)return null;var parsed=JSON.parse(raw),legacy=hasLegacySceneTitles(parsed),archive=normalize(parsed);if(legacy)persistLocalArchive(userId,archive,true);return archive;}catch(e){return null;}}
var data=fresh();
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function txt(html){var d=document.createElement("div");d.innerHTML=cleanHtml(html);var result="",blockTags=new Set(["P","DIV","UL","OL","LI","H1","H2","H3","BLOCKQUOTE"]);function walk(node){if(node.nodeType===3){result+=node.nodeValue;return;}if(node.nodeType!==1)return;var block=blockTags.has(node.tagName);if(block&&result&&!/\s$/.test(result))result+=" ";if(node.tagName==="BR")result+=" ";else Array.from(node.childNodes).forEach(walk);if(block&&!/\s$/.test(result))result+=" ";}Array.from(d.childNodes).forEach(walk);return result.replace(/\u00a0/g," ").trim();}
function safeUrl(value){try{var url=new URL(String(value||"").trim());return url.protocol==="http:"||url.protocol==="https:"?url.href:"";}catch(e){return"";}}
function lookupWordFromText(value){var word=String(value||"").trim().replace(/^[^\p{L}\p{M}]+|[^\p{L}\p{M}]+$/gu,"");return /^[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*$/u.test(word)?word:"";}
function selectedEditorWord(){var selection=window.getSelection();if(!selection||selection.isCollapsed||!selection.rangeCount||!selection.anchorNode||!editor.contains(selection.anchorNode))return"";return lookupWordFromText(selection.toString());}
function rememberWordSelection(){var word=selectedEditorWord(),selection=window.getSelection();if(word&&selection&&selection.rangeCount){rememberedWord=word;rememberedRange=selection.getRangeAt(0).cloneRange();}return word;}
function setWordLookupTab(tab){document.querySelectorAll("[data-word-tab]").forEach(function(button){var active=button.dataset.wordTab===tab;button.setAttribute("aria-selected",String(active));});$("wordThesaurusPanel").hidden=tab!=="thesaurus";$("wordDictionaryPanel").hidden=tab!=="dictionary";}
function renderWordLookup(result){
 var meanings=Array.isArray(result.meanings)?result.meanings:[],synonyms=Array.isArray(result.synonyms)?Array.from(new Set(result.synonyms.filter(function(word){return typeof word==="string"&&word.trim();}))).slice(0,40):[];
 $("wordLookupTitle").textContent=result.word||"Word lookup";
 $("wordPhonetic").textContent=result.phonetic||"";
 $("wordDefinitions").innerHTML=meanings.map(function(meaning){var definitions=Array.isArray(meaning.definitions)?meaning.definitions:[];return'<article class="word-definition"><h3>'+esc(meaning.partOfSpeech||"Meaning")+'</h3>'+definitions.map(function(item){return'<p>'+esc(item.definition||"")+'</p>'+(item.example?'<p class="word-example">“'+esc(item.example)+'”</p>':"");}).join("")+'</article>';}).join("")||'<p class="word-lookup-status">No definitions were returned for this entry.</p>';
 $("wordOrigin").textContent=result.origin||"";
 $("wordSynonyms").innerHTML=synonyms.length?synonyms.map(function(word){return'<button type="button" class="word-synonym" data-lookup-word="'+esc(word)+'">'+esc(word)+'</button>';}).join(""):'<p class="word-lookup-status">No synonyms were listed for this word.</p>';
 $("wordLookupStatus").removeAttribute("data-state");
 $("wordLookupStatus").textContent="English reference · "+meanings.length+" meaning"+(meanings.length===1?"":"s")+" · "+synonyms.length+" synonym"+(synonyms.length===1?"":"s");
}
async function fetchWordReference(word,signal){
 var response=await fetch("https://api.dictionaryapi.dev/api/v2/entries/en/"+encodeURIComponent(word.toLowerCase()),{method:"GET",cache:"no-store",headers:{accept:"application/json"},signal:signal});
 var payload=await response.json().catch(function(){return null;}),entry=Array.isArray(payload)?payload[0]:null;
 if(!response.ok||!entry||!Array.isArray(entry.meanings))return{ok:false,status:response.status===404||response.ok?404:response.status};
 var meanings=entry.meanings.slice(0,8).map(function(meaning){
  var definitions=(Array.isArray(meaning.definitions)?meaning.definitions:[]).slice(0,8).map(function(item){return{definition:typeof item.definition==="string"?item.definition.slice(0,1800):"",example:typeof item.example==="string"?item.example.slice(0,700):"",synonyms:Array.isArray(item.synonyms)?item.synonyms.filter(function(value){return typeof value==="string";}).slice(0,20):[]};}).filter(function(item){return item.definition;});
  var synonyms=Array.isArray(meaning.synonyms)?meaning.synonyms.filter(function(value){return typeof value==="string";}):[];
  return{partOfSpeech:typeof meaning.partOfSpeech==="string"?meaning.partOfSpeech.slice(0,80):"",definitions:definitions,synonyms:Array.from(new Set(synonyms.concat(definitions.flatMap(function(item){return item.synonyms;})))).slice(0,30)};
 }).filter(function(meaning){return meaning.definitions.length||meaning.synonyms.length;});
 var phonetic=typeof entry.phonetic==="string"?entry.phonetic:(Array.isArray(entry.phonetics)?(entry.phonetics.find(function(item){return item&&typeof item.text==="string";})||{}).text||"":"");
 return{ok:true,status:200,result:{word:typeof entry.word==="string"?entry.word.slice(0,100):word,phonetic:typeof phonetic==="string"?phonetic.slice(0,120):"",origin:typeof entry.origin==="string"?entry.origin.slice(0,1200):"",meanings:meanings,synonyms:Array.from(new Set(meanings.flatMap(function(meaning){return meaning.synonyms;}))).slice(0,40)}};
}
async function openWordLookup(rawWord){
 var word=lookupWordFromText(rawWord);
 if(!word){toast("Select one word in your manuscript first.");return;}
 rememberWordSelection();
 $("wordLookupTitle").textContent=word;
 $("wordLookupStatus").removeAttribute("data-state");
 $("wordLookupStatus").textContent="Looking up “"+word+"”…";
 $("wordSynonyms").innerHTML='<p class="word-lookup-status">Finding synonyms…</p>';
 $("wordDefinitions").innerHTML="";$("wordPhonetic").textContent="";$("wordOrigin").textContent="";
 setWordLookupTab("thesaurus");
 if(!wordDialog.open)wordDialog.showModal();
 if(wordLookupController)wordLookupController.abort();
 wordLookupController=new AbortController();var request=++wordLookupRequest;
 try{
  var lookup=await fetchWordReference(word,wordLookupController.signal);
  if(request!==wordLookupRequest)return;
  if(!lookup.ok){var message=lookup.status===404?"No dictionary entry found for “"+word+"”.":"The word reference is unavailable right now. Try again in a moment.";$("wordLookupStatus").dataset.state="error";$("wordLookupStatus").textContent=message;$("wordSynonyms").innerHTML='<p class="word-lookup-status">No synonyms are available.</p>';$("wordDefinitions").innerHTML='<p class="word-lookup-status">No definition is available.</p>';return;}
  renderWordLookup(lookup.result);
 }catch(error){if(error.name==="AbortError"||request!==wordLookupRequest)return;$("wordLookupStatus").dataset.state="error";$("wordLookupStatus").textContent="The word reference is unavailable. Check your connection and try again.";$("wordSynonyms").innerHTML='<p class="word-lookup-status">No synonyms are available.</p>';}
}
function stableJson(value){if(Array.isArray(value))return"["+value.map(stableJson).join(",")+"]";if(value&&typeof value==="object")return"{"+Object.keys(value).sort().map(function(key){return JSON.stringify(key)+":"+stableJson(value[key]);}).join(",")+"}";return JSON.stringify(value);}
function words(s){s=String(s||"").trim();return s?s.split(/\s+/).length:0;}
function currentBook(){return data.books.find(function(b){return b.id===data.bookId;})||data.books[0];}
function currentChapter(){var b=currentBook();return b&&(b.chapters.find(function(c){return c.id===data.chapterId;})||b.chapters[0]);}
function currentScene(){var c=currentChapter();return c&&(c.scenes.find(function(s){return s.id===data.sceneId;})||c.scenes[0]);}
function ensure(){var b=currentBook();if(!b)return;b.chapters=b.chapters||[];data.bookId=b.id;var c=b.chapters.find(function(v){return v.id===data.chapterId;})||b.chapters[0];data.chapterId=c.id;var s=c.scenes.find(function(v){return v.id===data.sceneId;})||c.scenes[0];data.sceneId=s.id;}
function sync(){if(view!=="write")return;var s=currentScene();if(s)s.content=cleanHtml(editor.innerHTML);}
function status(s){$("saveState").textContent=s;}
function activeKey(key){return accountKey(key,currentUser&&currentUser.id);}
function persistLocalArchive(userId,archive,pending){localStorage.setItem(accountKey(KEY,userId),JSON.stringify(archive));if(pending)localStorage.setItem(accountKey(PENDING_KEY,userId),"1");else localStorage.removeItem(accountKey(PENDING_KEY,userId));}
function setCloudStatus(message,state){var label=$("cloudStatus"),dot=$("cloudDot");if(label)label.textContent=message;if(dot)dot.className=state||"";}
function save(){if(!currentUser)return;sync();try{var serialized=JSON.stringify(data),key=activeKey(KEY);if(serialized!==localStorage.getItem(key)){localStorage.setItem(key,serialized);localStorage.setItem(activeKey(PENDING_KEY),"1");localGeneration++;}if(cloudReady&&localStorage.getItem(activeKey(PENDING_KEY))==="1"){status("Saved here · syncing…");setCloudStatus("Saving to your account…","pending");queueCloudSync();}else if(cloudReady){status("Synced to your account");setCloudStatus("Synced across devices","ready");}else{status("Saved on this device");setCloudStatus("Saved on this device · sync when online","offline");}}catch(e){status("Browser storage is full");setCloudStatus("Device storage is full","offline");}counts();}
function later(){status("Saving…");clearTimeout(timer);timer=setTimeout(save,400);}
function toast(s){var t=$("toast");t.textContent=s;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(function(){t.classList.remove("show");},2600);}
function copyArchive(value){return JSON.parse(JSON.stringify(value));}
function mergeEntries(localItems,remoteItems,mergeItem){var rows=new Map();(remoteItems||[]).forEach(function(item){rows.set(item.id,copyArchive(item));});(localItems||[]).forEach(function(item){var remote=rows.get(item.id);rows.set(item.id,mergeItem?mergeItem(copyArchive(item),remote):Object.assign({},remote||{},copyArchive(item)));});return Array.from(rows.values());}
function mergeArchiveCopies(localCopy,remoteCopy){var local=normalize(copyArchive(localCopy)),remote=normalize(copyArchive(remoteCopy));function mergeChapter(localChapter,remoteChapter){var merged=Object.assign({},remoteChapter||{},localChapter);merged.scenes=mergeEntries(localChapter.scenes,remoteChapter&&remoteChapter.scenes);return merged;}function mergeBook(localBook,remoteBook){var merged=Object.assign({},remoteBook||{},localBook);merged.chapters=mergeEntries(localBook.chapters,remoteBook&&remoteBook.chapters,mergeChapter);return merged;}var merged=Object.assign({},remote,local);merged.books=mergeEntries(local.books,remote.books,mergeBook);["subjects","places","notes","sources"].forEach(function(key){merged[key]=mergeEntries(local[key],remote[key]);});return normalize(merged);}
function archivesMatch(a,b){try{return stableJson(normalize(copyArchive(a)))===stableJson(normalize(copyArchive(b)));}catch(e){return false;}}
function cloudConflict(){cloudReady=false;clearTimeout(cloudTimer);setCloudStatus("Another device has newer changes · back up this device before syncing","offline");status("Sync paused · conflicting changes");toast("Sync paused to protect your writing. Download a backup.");}
function markCloudSynced(stamp,message){cloudStamp=stamp||null;if(cloudStamp)localStorage.setItem(activeKey(LAST_SYNC_KEY),cloudStamp);else localStorage.removeItem(activeKey(LAST_SYNC_KEY));localStorage.removeItem(activeKey(PENDING_KEY));status(message||"Synced to your account");setCloudStatus("Synced across devices","ready");}
function queueCloudSync(){clearTimeout(cloudTimer);cloudTimer=setTimeout(function(){pushCloud(false);},850);}
async function readCloudArchive(userId){var result=await supabaseClient.schema("tyler_archive").from("writer_archive_documents").select("archive_json,updated_at").eq("owner_id",userId).maybeSingle();if(result.error)throw result.error;return result.data;}
async function readLegacyCloudArchive(){if(window.location.hostname==="theblackstaginn.github.io")return{archive:null,updatedAt:null};var response=await fetch("/api/archive",{method:"GET",credentials:"same-origin",cache:"no-store",headers:{accept:"application/json"}});if(!response.ok)throw new Error("Previous archive unavailable");return response.json();}
async function recoverLegacyArchive(userId,base){var importedKey=accountKey(LEGACY_IMPORTED_KEY,userId);if(localStorage.getItem(importedKey)==="1")return{archive:base,checked:true,imported:false};var checked=false,legacyCloud=null,legacyLocal=null;try{var stored=localStorage.getItem(LEGACY_KEY);if(stored)legacyLocal=normalize(JSON.parse(stored));}catch(e){}try{legacyCloud=await readLegacyCloudArchive();checked=true;}catch(e){}var archive=base?normalize(copyArchive(base)):null,imported=false;if(legacyLocal){archive=archive?mergeArchiveCopies(archive,legacyLocal):legacyLocal;imported=true;}if(legacyCloud&&legacyCloud.archive){var remote=normalize(legacyCloud.archive);archive=archive?mergeArchiveCopies(archive,remote):remote;imported=true;}if(checked)localStorage.setItem(importedKey,"1");return{archive:archive,checked:checked,imported:imported};}
async function pushCloud(keepalive){
 if(!cloudReady||!currentUser)return;
 if(cloudInFlight){cloudQueueAgain=true;return;}
 cloudInFlight=true;cloudQueueAgain=false;
 var ownerId=currentUser.id,archiveSnapshot=copyArchive(data),expectedStamp=cloudStamp;
 try{
  var table=supabaseClient.schema("tyler_archive").from("writer_archive_documents"),result;
  if(expectedStamp){
   result=await table.update({archive_json:archiveSnapshot}).eq("owner_id",ownerId).eq("updated_at",expectedStamp).select("updated_at").maybeSingle();
   if(result.error)throw result.error;
   if(!result.data){if(currentUser&&currentUser.id===ownerId)cloudConflict();return;}
  }else{
   result=await table.insert({owner_id:ownerId,archive_json:archiveSnapshot}).select("updated_at").single();
   if(result.error){if(result.error.code==="23505"){if(currentUser&&currentUser.id===ownerId)cloudConflict();return;}throw result.error;}
  }
  if(!currentUser||currentUser.id!==ownerId)return;
  cloudStamp=result.data&&result.data.updated_at||null;
  if(cloudStamp)localStorage.setItem(accountKey(LAST_SYNC_KEY,ownerId),cloudStamp);
  if(archivesMatch(data,archiveSnapshot)){
   localStorage.removeItem(accountKey(PENDING_KEY,ownerId));
   status("Synced to your account");setCloudStatus("Synced across devices","ready");
  }else queueCloudSync();
 }catch(e){
  if(currentUser&&currentUser.id===ownerId){
   setCloudStatus("Saved on this device · cloud sync paused","offline");
   status("Saved here · sync paused");
  }
 }finally{
  cloudInFlight=false;
  if(cloudQueueAgain){cloudQueueAgain=false;queueCloudSync();}
 }
}
async function bootstrapCloud(user){
 if(!user||!currentUser||currentUser.id!==user.id)return;
 setCloudStatus("Opening your account archive…","pending");
 try{
  var record=await readCloudArchive(user.id);
  if(!currentUser||currentUser.id!==user.id)return;
  cloudStamp=record&&record.updated_at||null;
  var local=readLocalArchive(user.id),pending=localStorage.getItem(accountKey(PENDING_KEY,user.id))==="1";
  var lastSynced=localStorage.getItem(accountKey(LAST_SYNC_KEY,user.id));
  if(pending&&local&&record&&!archivesMatch(local,record.archive_json)&&(!lastSynced||lastSynced!==record.updated_at)){
   data=local;renderAll();cloudConflict();return;
  }
  var legacyCloud=!!(record&&hasLegacySceneTitles(record.archive_json));
  var base=pending&&local?local:record?normalize(record.archive_json):local;
  var recovered=await recoverLegacyArchive(user.id,base);
  if(!currentUser||currentUser.id!==user.id)return;
  cloudReady=true;
  if(recovered.archive){
   data=recovered.archive;
   var changed=!base||!archivesMatch(data,base),needsPush=!record||pending||changed||legacyCloud;
   persistLocalArchive(user.id,data,needsPush);renderAll();
   if(needsPush){
    setCloudStatus(recovered.imported?"Moving your saved archive into this account…":"Saving recovered writing…","pending");
    queueCloudSync();
   }else markCloudSynced(record.updated_at,"Synced from your account");
   return;
  }
  data=fresh();persistLocalArchive(user.id,data,true);
  if(recovered.checked)localStorage.setItem(accountKey(LEGACY_IMPORTED_KEY,user.id),"1");
  renderAll();setCloudStatus("Creating your private archive…","pending");queueCloudSync();
 }catch(e){
  if(!currentUser||currentUser.id!==user.id)return;
  cloudReady=false;
  var localCopy=readLocalArchive(user.id);
  data=localCopy||fresh();renderAll();
  setCloudStatus(localCopy?"Saved on this device · reconnect to sync":"Offline · sign in again to sync","offline");
  status(localCopy?"Saved on this device":"Offline");
 }
}
async function manualSync(){
 if(!currentUser)return;
 if(cloudInFlight){cloudQueueAgain=true;setCloudStatus("Finishing a cloud save…","pending");return;}
 sync();save();clearTimeout(timer);clearTimeout(cloudTimer);
 var userId=currentUser.id,localAtStart=copyArchive(data);
 var pending=localStorage.getItem(accountKey(PENDING_KEY,userId))==="1";
 var lastSynced=localStorage.getItem(accountKey(LAST_SYNC_KEY,userId));
 try{
  setCloudStatus("Checking your account archive…","pending");
  var record=await readCloudArchive(userId);
  if(!currentUser||currentUser.id!==userId)return;
  if(!archivesMatch(data,localAtStart)){setCloudStatus("New edits are waiting to sync","pending");queueCloudSync();return;}
  if(pending&&record&&!archivesMatch(localAtStart,record.archive_json)&&(!lastSynced||lastSynced!==record.updated_at)){
   cloudConflict();return;
  }
  cloudStamp=record&&record.updated_at||null;
  var base=pending?localAtStart:record?normalize(record.archive_json):localAtStart;
  var recovered=await recoverLegacyArchive(userId,base);
  if(!currentUser||currentUser.id!==userId)return;
  var next=recovered.archive||base,needsPush=!record||pending||!archivesMatch(next,record.archive_json);
  if(!archivesMatch(data,next)){data=next;renderAll();}
  cloudReady=true;
  persistLocalArchive(userId,data,needsPush);
  if(!needsPush){markCloudSynced(record.updated_at,"Synced from your account");return;}
  await pushCloud(false);
 }catch(e){
  if(!currentUser||currentUser.id!==userId)return;
  cloudReady=false;
  setCloudStatus("Saved on this device · cloud sync paused","offline");
  status("Sync check failed");
 }
}
function setPasswordResetMode(active){$("authForm").hidden=active;$("passwordResetForm").hidden=!active;$("authTitle").textContent=active?"Choose a new password":"Your writing, wherever you are";$("authDescription").textContent=active?"Choose a password with at least eight characters. You can use it to sign in to your private archive.":"Sign in to your archive, or enter your email and password to create your own private archive. You may need to confirm your email.";$("authMessage").textContent="";if(active){$("shell").hidden=true;$("authGate").hidden=false;setTimeout(function(){$("newPassword").focus();},0);}}
function setAuthUser(user){if(!user){if(currentUser)save();currentUser=null;cloudReady=false;cloudStamp=null;loadedUserId=null;loadingUserId=null;setPasswordResetMode(false);$("shell").hidden=true;$("authGate").hidden=false;$("accountLabel").hidden=true;$("signOut").hidden=true;return;}currentUser=user;$("authGate").hidden=true;$("shell").hidden=false;$("accountLabel").textContent=user.email||"Signed in";$("accountLabel").hidden=false;$("signOut").hidden=false;if(loadedUserId!==user.id&&loadingUserId!==user.id){loadingUserId=user.id;bootstrapCloud(user).finally(function(){if(loadingUserId===user.id)loadingUserId=null;if(currentUser&&currentUser.id===user.id)loadedUserId=user.id;});}}
function isPasswordRecoveryLink(){return new URLSearchParams(window.location.hash.slice(1)).get("type")==="recovery";}
function initAuth(){supabaseClient.auth.onAuthStateChange(function(event,session){setTimeout(function(){if(event==="PASSWORD_RECOVERY"||(event==="INITIAL_SESSION"&&isPasswordRecoveryLink())){setPasswordResetMode(true);return;}if(event==="SIGNED_OUT")setPasswordResetMode(false);setAuthUser(session&&session.user||null);},0);});supabaseClient.auth.getSession().then(function(result){if(result.error)throw result.error;if(isPasswordRecoveryLink()){setPasswordResetMode(true);return;}setAuthUser(result.data.session&&result.data.session.user||null);}).catch(function(error){$("authMessage").textContent="Could not check your sign-in. Try again.";});}
$("authForm").addEventListener("submit",async function(event){event.preventDefault();$("authMessage").textContent="Signing in…";try{var result=await supabaseClient.auth.signInWithPassword({email:$("authEmail").value.trim(),password:$("authPassword").value});$("authMessage").textContent=result.error?result.error.message:"Signed in. Opening your archive…";}catch(error){$("authMessage").textContent=error&&error.message||"Could not sign in. Please try again.";}});
$("createAccount").addEventListener("click",async function(){if(!$("authForm").reportValidity())return;var button=$("createAccount");button.disabled=true;$("authMessage").textContent="Creating your account…";try{var result=await supabaseClient.auth.signUp({email:$("authEmail").value.trim(),password:$("authPassword").value,options:{emailRedirectTo:window.location.origin+window.location.pathname}});if(result.error){$("authMessage").textContent=result.error.message;return;}var user=result.data&&result.data.user;if(user&&Array.isArray(user.identities)&&user.identities.length===0){$("authMessage").textContent="An account already exists for this email. Sign in, or use the password reset link below to set a password.";return;}if(result.data.session){$("authMessage").textContent="Your account is ready. Opening your private archive…";}else{$("authMessage").textContent="Check your inbox for a confirmation link. After confirming, return here and sign in to open your private archive.";}}catch(error){$("authMessage").textContent=error&&error.message||"Could not create the account. Please try again.";}finally{button.disabled=false;}});
$("forgotPassword").addEventListener("click",async function(){var emailInput=$("authEmail"),email=emailInput.value.trim();if(!emailInput.reportValidity())return;var button=$("forgotPassword");button.disabled=true;$("authMessage").textContent="Sending a password reset link…";try{var result=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+window.location.pathname});$("authMessage").textContent=result.error?result.error.message:"If this email has an account, a reset link is on its way. Check your inbox and spam folder.";}catch(error){$("authMessage").textContent=error&&error.message||"Could not send a reset link. Please try again.";}finally{button.disabled=false;}});
$("passwordResetForm").addEventListener("submit",async function(event){event.preventDefault();var password=$("newPassword").value;if(password!==$("confirmPassword").value){$("authMessage").textContent="Those passwords do not match.";return;}var button=$("updatePassword");button.disabled=true;$("authMessage").textContent="Saving your new password…";try{var result=await supabaseClient.auth.updateUser({password:password});if(result.error){$("authMessage").textContent=result.error.message;return;}$("passwordResetForm").reset();setPasswordResetMode(false);setAuthUser(result.data.user);toast("Password updated. Your archive is opening.");}catch(error){$("authMessage").textContent=error&&error.message||"Could not update your password. Please try again.";}finally{button.disabled=false;}});
$("cancelPasswordReset").addEventListener("click",async function(){await supabaseClient.auth.signOut();setPasswordResetMode(false);});
$("signOut").addEventListener("click",async function(){save();clearTimeout(cloudTimer);while(cloudInFlight)await new Promise(function(resolve){setTimeout(resolve,50);});if(cloudReady&&localStorage.getItem(activeKey(PENDING_KEY))==="1")await pushCloud(false);await supabaseClient.auth.signOut();});
function counts(){
 var b=currentBook(),s=currentScene(),n=0;
 if(b)b.chapters.forEach(function(c){c.scenes.forEach(function(q){n+=words(txt(q.content));});});
 $("bookCount").textContent=n.toLocaleString();
 $("sceneCount").textContent=words(s?txt(s.content):"").toLocaleString();
 $("folio").textContent=b?b.title.toUpperCase():"";
 $("chapterName").textContent=currentChapter()?currentChapter().title.toUpperCase():"";
 $("focus").disabled=!b;$("exportText").disabled=!b;$("printPdf").disabled=!b;
}
function renderOutline(){
 var books=$("bookList"),b=currentBook();
 books.innerHTML=data.books.map(function(q){return'<div class="book-item"><button class="book-choice '+(q.id===data.bookId?"active":"")+'" type="button" data-book="'+esc(q.id)+'" title="'+esc(q.title)+'">'+esc(q.title)+'</button><button class="book-delete" type="button" data-delete-book="'+esc(q.id)+'" aria-label="Delete manuscript '+esc(q.title)+'" title="Delete manuscript">×</button></div>';}).join("");
 $("newChapter").disabled=!b;
 if(!b){$("outlineList").innerHTML='<p class="empty">Create a manuscript to begin.</p>';return;}
 $("outlineList").innerHTML=b.chapters.map(function(c){var scenes=c.scenes.map(function(s){return'<div class="scene-item"><button type="button" class="scene-link '+(s.id===data.sceneId?"active":"")+'" data-scene="'+esc(s.id)+'" data-chapter="'+esc(c.id)+'">'+esc(s.title)+'</button><button type="button" class="scene-delete" data-delete-scene="'+esc(s.id)+'" data-chapter="'+esc(c.id)+'" aria-label="Delete section '+esc(s.title)+'" title="Delete section">×</button></div>';}).join("");return'<div class="chapter-group"><div class="chapter-head"><span>'+esc(c.title)+'</span><div class="chapter-actions"><button type="button" data-add-scene="'+esc(c.id)+'" aria-label="Add section to '+esc(c.title)+'" title="Add section">+</button><button type="button" class="chapter-delete" data-delete-chapter="'+esc(c.id)+'" aria-label="Delete chapter '+esc(c.title)+'" title="Delete chapter">×</button></div></div>'+scenes+'</div>';}).join("");
}
function renderEditor(){
 ensure();
 var b=currentBook(),s=currentScene();
 if(!b||!s){$("bookTitle").value="";$("sceneTitle").value="";$("bookTitle").disabled=true;$("sceneTitle").disabled=true;editor.contentEditable="false";editor.dataset.placeholder="Create a manuscript to begin…";editor.innerHTML="";document.querySelectorAll("[data-command]").forEach(function(button){button.disabled=true;});$("date").textContent="";counts();return;}
 $("bookTitle").disabled=false;$("sceneTitle").disabled=false;editor.contentEditable="true";editor.dataset.placeholder="Begin anywhere…";document.querySelectorAll("[data-command]").forEach(function(button){button.disabled=false;});$("bookTitle").value=b.title;$("sceneTitle").value=s.title;editor.innerHTML=cleanHtml(s.content);$("date").textContent=new Intl.DateTimeFormat(undefined,{month:"long",year:"numeric"}).format(new Date());counts();
}
function requestDelete(title,message,action){
 pendingDelete=action;
 $("deleteDialogTitle").textContent=title;
 $("deleteDialogMessage").textContent=message;
 deleteDialog.showModal();
}
function finishDelete(accepted){
 var action=pendingDelete;pendingDelete=null;
 if(deleteDialog.open)deleteDialog.close();
 if(accepted&&action)action();
}
function deleteBook(bookId){
 var target=data.books.find(function(b){return b.id===bookId;});if(!target)return;
 var chapterCount=target.chapters.length,scenes=sceneTotal(target),message='Delete manuscript "'+target.title+'" and all '+chapterCount+' chapter'+(chapterCount===1?'':'s')+', '+scenes+' section'+(scenes===1?'':'s')+', and their writing? This cannot be undone.';
 requestDelete("Delete manuscript?",message,function(){
  var current=data.books.find(function(b){return b.id===bookId;});if(!current)return;
  if(view==="write")sync();
  var index=data.books.findIndex(function(b){return b.id===bookId;}),wasCurrent=data.bookId===bookId;
  data.books.splice(index,1);
  if(wasCurrent){var next=data.books[Math.min(index,data.books.length-1)];if(next){data.bookId=next.id;data.chapterId=next.chapters[0].id;data.sceneId=next.chapters[0].scenes[0].id;}else{data.bookId="";data.chapterId="";data.sceneId="";}}
  if(view==="write"){renderOutline();renderEditor();}
  save();if(view==="library")renderCollection();toast('Deleted manuscript "'+current.title+'".');
 });
}
function deleteChapter(chapterId){
 var b=currentBook();if(!b)return;
 var target=b.chapters.find(function(c){return c.id===chapterId;});if(!target)return;
 var sceneCount=target.scenes.length,message='Delete chapter "'+target.title+'" and all '+sceneCount+' section'+(sceneCount===1?'':'s')+' and their writing? This cannot be undone.';
 if(b.chapters.length===1)message+=' A fresh blank chapter will be created so the manuscript remains ready to edit.';
 requestDelete("Delete chapter?",message,function(){
  var currentBookData=currentBook(),chapterIndex=currentBookData?currentBookData.chapters.findIndex(function(c){return c.id===chapterId;}):-1;if(chapterIndex<0)return;
  var current=currentBookData.chapters[chapterIndex],wasCurrent=data.chapterId===chapterId;sync();currentBookData.chapters.splice(chapterIndex,1);
  if(!currentBookData.chapters.length)currentBookData.chapters.push({id:id(),title:"Chapter One",scenes:[scene("First Section")]});
  if(wasCurrent){var next=currentBookData.chapters[Math.min(chapterIndex,currentBookData.chapters.length-1)];data.chapterId=next.id;data.sceneId=next.scenes[0].id;}
  renderOutline();renderEditor();save();toast('Deleted chapter "'+current.title+'".');
 });
}
function deleteScene(chapterId,sceneId){
 var b=currentBook(),c=b&&b.chapters.find(function(ch){return ch.id===chapterId;}),target=c&&c.scenes.find(function(s){return s.id===sceneId;});if(!target)return;
 var message='Delete section "'+target.title+'" and its writing? This cannot be undone.';
 if(c.scenes.length===1)message+=' A fresh blank section will be created so the chapter remains ready to edit.';
 requestDelete("Delete section?",message,function(){
  var currentBookData=currentBook(),currentChapterData=currentBookData&&currentBookData.chapters.find(function(ch){return ch.id===chapterId;}),sceneIndex=currentChapterData?currentChapterData.scenes.findIndex(function(s){return s.id===sceneId;}):-1;if(sceneIndex<0)return;
  var current=currentChapterData.scenes[sceneIndex],wasCurrent=data.chapterId===chapterId&&data.sceneId===sceneId;sync();currentChapterData.scenes.splice(sceneIndex,1);
  if(!currentChapterData.scenes.length)currentChapterData.scenes.push(scene("First Section"));
  if(wasCurrent){data.chapterId=chapterId;var next=currentChapterData.scenes[Math.min(sceneIndex,currentChapterData.scenes.length-1)];data.sceneId=next.id;}
  renderOutline();renderEditor();save();toast('Deleted section "'+current.title+'".');
 });
}
function setFocusMode(on){
 var shell=$("shell"),button=$("focus");shell.classList.toggle("focus-mode",!!on);document.body.classList.toggle("focus-active",!!on);button.setAttribute("aria-pressed",String(!!on));button.textContent=on?"Exit focus":"Focus";
 if(on){$("toast").classList.remove("show");}else{button.focus({preventScroll:true});}
}
function switchView(v){if(view==="write"&&v!=="write"){sync();rememberedWord="";rememberedRange=null;}view=v;document.querySelectorAll(".nav-button").forEach(function(b){var on=b.dataset.view===v;b.classList.toggle("active",on);if(on)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");});$("outline").hidden=v!=="write";$("writeView").hidden=v!=="write";$("collection").hidden=v==="write";if(v==="write"){renderOutline();renderEditor();}else renderCollection();}
function sceneTotal(b){return b.chapters.reduce(function(n,c){return n+c.scenes.length;},0);}
function empty(title,desc){return'<div class="empty"><strong>'+esc(title)+'</strong><p>'+esc(desc)+'</p></div>';}
function renderCollection(){
 var cfg={library:["Your Library","Manuscripts gathered in one place. Open a draft to return to the page."],subjects:["Subjects","Keep the people, ideas, and themes in your stories close at hand."],places:["Places","Collect the rooms, roads, towns, and landscapes your stories return to."],notes:["Notes","Save loose thoughts and fragments for later."],sources:["Sources","Keep citations, quoted passages, and source notes together."]}[view]||["Your Library",""],label=view==="library"?"New manuscript":"Add "+({subjects:"subject",places:"place",notes:"note",sources:"source"}[view]||"entry"),html='<div class="collection-inner"><div class="collection-head"><div><span class="eyebrow">THE WRITER\'S ARCHIVE / '+esc(view.toUpperCase())+'</span><h1>'+esc(cfg[0])+'</h1><p>'+esc(cfg[1])+'</p></div><button class="button primary" id="addEntry" type="button">'+label+'</button></div><div class="grid">';
 if(view==="library"){
  if(!data.books.length)html+=empty("Your library is waiting","Create a manuscript and give your next story a place to live.");
  data.books.forEach(function(b){var n=0;b.chapters.forEach(function(c){c.scenes.forEach(function(s){n+=words(txt(s.content));});});html+='<article class="card"><h3>'+esc(b.title)+'</h3><p>'+b.chapters.length+' chapters · '+sceneTotal(b)+' sections</p><span class="card-meta">'+n.toLocaleString()+' words</span><div class="card-actions"><button class="button primary" data-open-book="'+esc(b.id)+'" type="button">Open manuscript</button><button class="button danger" data-delete-book="'+esc(b.id)+'" type="button">Delete</button></div></article>';});
 }else{
  var items=data[view]||[];if(view==="sources")items=items.slice().sort(function(a,b){return String(a.type||"").localeCompare(String(b.type||""),undefined,{sensitivity:"base"})||String(a.title||"").localeCompare(String(b.title||""),undefined,{sensitivity:"base"});});if(!items.length)html+=empty(view==="sources"?"No sources yet":"Nothing here yet",view==="sources"?"Add a book, article, interview, or website when you quote it.":"Add an entry when it belongs in your archive.");
  items.forEach(function(e){var content="";if(view==="sources"){var citation=[e.author,e.publication,e.date].filter(Boolean).map(esc).join(" · "),url=safeUrl(e.url),type=e.type?'<span class="source-type">'+esc(e.type)+'</span>':"",locator=e.locator?'<p class="source-locator">Location: '+esc(e.locator)+'</p>':"",quote=e.quote?'<blockquote class="source-quote">'+esc(e.quote)+'</blockquote>':"",link=e.url?(url?'<a class="source-link" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Open source</a>':'<p class="source-locator">URL / DOI: '+esc(e.url)+'</p>'):"",notes=e.details?'<p class="source-notes"><strong>Notes:</strong> '+esc(e.details)+'</p>':"";content=type+(citation?'<p class="source-citation">'+citation+'</p>':"")+locator+quote+link+notes;}else{content='<p>'+esc(e.details||"A new page, ready for your notes.")+'</p>';}html+='<article class="card" data-archive-entry="'+esc(e.id)+'" tabindex="-1"><h3>'+esc(e.title)+'</h3>'+content+'<div class="card-actions"><button class="button" data-edit="'+esc(e.id)+'" type="button">Edit</button><button class="button" data-remove="'+esc(e.id)+'" type="button">Remove</button></div></article>';});
 }
 $("collection").innerHTML=html+"</div></div>";
}
function openDialog(kind,parent,existing){mode=kind;parentId=parent||"";editId=existing?existing.id:"";var names={book:"New manuscript",chapter:"New chapter",scene:"New section",subjects:"Subject",places:"Place",notes:"Note",sources:"Source"};$("dialogTitle").textContent=existing?"Edit "+(names[kind]||"entry").toLowerCase():names[kind]||"New entry";$("entryTitleLabel").textContent=kind==="sources"?"Source title":"Title";$("entryTitle").value=existing?existing.title:kind==="book"?"Untitled Manuscript":kind==="chapter"?"New Chapter":kind==="scene"?"New Section":"";$("entryDetails").value=existing?existing.details||"":"";$("detailsWrap").hidden=["book","chapter","scene","sources"].includes(kind);$("sourceFields").hidden=kind!=="sources";["sourceType","sourceAuthor","sourcePublication","sourceDate","sourceLocator","sourceUrl","sourceQuote","sourceNotes"].forEach(function(id){var property={sourceType:"type",sourceAuthor:"author",sourcePublication:"publication",sourceDate:"date",sourceLocator:"locator",sourceUrl:"url",sourceQuote:"quote",sourceNotes:"details"}[id];$(id).value=existing?existing[property]||"":"";});dialog.showModal();setTimeout(function(){$("entryTitle").focus();$("entryTitle").select();},20);}
function newBook(name){var b=book(name);data.books.push(b);data.bookId=b.id;data.chapterId=b.chapters[0].id;data.sceneId=b.chapters[0].scenes[0].id;switchView("write");save();toast("Your new manuscript is ready.");}
function submit(event){event.preventDefault();var title=$("entryTitle").value.trim(),details=$("entryDetails").value.trim();if(!title)return;if(editId&&mode==="sources"){var source=data.sources.find(function(e){return e.id===editId;});if(source){source.title=title;source.type=$("sourceType").value.trim();source.author=$("sourceAuthor").value.trim();source.publication=$("sourcePublication").value.trim();source.date=$("sourceDate").value.trim();source.locator=$("sourceLocator").value.trim();source.url=$("sourceUrl").value.trim();source.quote=$("sourceQuote").value.trim();source.details=$("sourceNotes").value.trim();}}else if(editId&&["subjects","places","notes"].includes(mode)){var old=data[mode].find(function(e){return e.id===editId;});if(old){old.title=title;old.details=details;}}else if(mode==="book"){dialog.close();newBook(title);return;}else if(mode==="chapter"){var ch={id:id(),title:title,scenes:[scene("First Section")]};currentBook().chapters.push(ch);data.chapterId=ch.id;data.sceneId=ch.scenes[0].id;}else if(mode==="scene"){var parent=currentBook().chapters.find(function(c){return c.id===parentId;})||currentChapter(),s=scene(title);parent.scenes.push(s);data.chapterId=parent.id;data.sceneId=s.id;}else if(mode==="sources"){data.sources.push({id:id(),title:title,type:$("sourceType").value.trim(),author:$("sourceAuthor").value.trim(),publication:$("sourcePublication").value.trim(),date:$("sourceDate").value.trim(),locator:$("sourceLocator").value.trim(),url:$("sourceUrl").value.trim(),quote:$("sourceQuote").value.trim(),details:$("sourceNotes").value.trim()});}else data[mode].push({id:id(),title:title,details:details});dialog.close();$("entryForm").reset();save();renderOutline();if(view==="write")renderEditor();else renderCollection();toast("Saved to your archive.");}
function download(name,content,type){var u=URL.createObjectURL(new Blob([content],{type:type})),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u);},900);}
function loadMammoth(){
 if(window.mammoth&&typeof window.mammoth.convertToHtml==="function")return Promise.resolve(window.mammoth);
 if(loadedMammoth)return loadedMammoth;
 loadedMammoth=new Promise(function(resolve,reject){
  var script=document.createElement("script");script.src="https://cdn.jsdelivr.net/npm/mammoth@1.13.0/mammoth.browser.min.js";script.integrity="sha384-8NWE3bZDrmRI4IePMoQaEoLhAQ1MmRMJkdNgnGiHRFanTqsFKr0TmK6aSZvFJ/PO";script.crossOrigin="anonymous";script.async=true;
  script.onload=function(){if(window.mammoth&&typeof window.mammoth.convertToHtml==="function")resolve(window.mammoth);else{loadedMammoth=null;reject(new Error("The Word parser did not load."));}};
  script.onerror=function(){loadedMammoth=null;reject(new Error("The Word parser could not be loaded."));};document.head.appendChild(script);
 });
 return loadedMammoth;
}
function importTitleFromFilename(fileName){return String(fileName||"").replace(/\.docx$/i,"").trim().slice(0,120)||"Untitled Manuscript";}
function appendCellText(target,source,state){
 var blockTags=new Set(["P","DIV","UL","OL","LI","BLOCKQUOTE","H1","H2","H3"]);
 Array.from(source.childNodes).forEach(function(node){
  if(node.nodeType===3){target.appendChild(document.createTextNode(node.nodeValue));return;}
  if(node.nodeType!==1)return;
  if(blockTags.has(node.tagName)){if(state.hasBlock)target.appendChild(document.createTextNode(" / "));state.hasBlock=true;appendCellText(target,node,state);return;}
  target.appendChild(node.cloneNode(true));
 });
}
function flattenDocxTables(doc,warnings){
 var tables=Array.from(doc.querySelectorAll("table")).reverse();if(!tables.length)return;
 warnings.push("Table layout is not supported. Text from each row is kept in reading order as paragraphs.");
 tables.forEach(function(table){
  var output=[];
  Array.from(table.querySelectorAll("tr")).forEach(function(row){
   var cells=Array.from(row.children).filter(function(cell){return cell.tagName==="TD"||cell.tagName==="TH";});if(!cells.length)return;
   var paragraph=document.createElement("p");
   cells.forEach(function(cell,index){if(index)paragraph.appendChild(document.createTextNode(" · "));appendCellText(paragraph,cell,{hasBlock:false});});
   output.push(paragraph);
  });
  if(!output.length&&table.textContent.trim()){var paragraph=document.createElement("p");paragraph.textContent=table.textContent.trim();output.push(paragraph);}
  table.replaceWith.apply(table,output);
 });
}
function importedScene(title){return{id:id(),title:title||"First Section",content:""};}
function buildImportedBook(fileName,html,messages){
 var doc=new DOMParser().parseFromString(String(html||""),"text/html"),warnings=[];
 var hasTables=!!doc.querySelector("table"),hasImages=!!doc.querySelector("img"),hasFootnotes=/(?:id|href|class)=["'][^"']*(?:footnote|endnote)/i.test(String(html||""));
 var h1Count=doc.querySelectorAll("h1").length,h2Count=doc.querySelectorAll("h2").length;
 flattenDocxTables(doc,warnings);
 if(hasImages){
  warnings.push("Images are not displayed in the editor. Text placeholders will mark where an image appeared.");
  Array.from(doc.querySelectorAll("img")).forEach(function(image){var label=image.getAttribute("alt");image.replaceWith(document.createTextNode(label?"[Image: "+label+" omitted]":"[Image omitted]"));});
 }
 if(hasFootnotes)warnings.push("Footnote or endnote text is imported inline, but Word page placement and cross-reference formatting may change.");
 if(!h1Count&&!h2Count)warnings.push("No Heading 1 or Heading 2 styles were found. All content will be placed in Chapter One → First Section.");
 else if(!h1Count&&h2Count)warnings.push("No Heading 1 styles were found. Heading 2 sections will be grouped under Chapter One.");
 (messages||[]).filter(function(message){return message&&message.type==="warning"&&message.message;}).forEach(function(message){warnings.push("Word formatting note: "+message.message);});
 var chapters=[],currentChapter=null,currentScene=null,sawHeading1=false,sawHeading2=false;
 function startChapter(title){currentChapter={id:id(),title:title||("Chapter "+(chapters.length+1)),scenes:[]};chapters.push(currentChapter);currentScene=null;}
 function finishScene(){if(currentScene&&currentChapter){currentScene.content=cleanHtml(currentScene.content);currentChapter.scenes.push(currentScene);}currentScene=null;}
 function finishChapter(){if(!currentChapter)return;finishScene();if(!currentChapter.scenes.length)currentChapter.scenes.push(importedScene("First Section"));currentChapter=null;}
 function ensureScene(){if(!currentChapter)startChapter("Chapter One");if(!currentScene)currentScene=importedScene("First Section");}
 Array.from(doc.body.childNodes).forEach(function(node){
  if(node.nodeType===3){if(!node.nodeValue.trim())return;ensureScene();var holder=document.createElement("div");holder.textContent=node.nodeValue;currentScene.content+=holder.innerHTML+"\n";return;}
  if(node.nodeType!==1)return;
  var tag=node.tagName,title=(node.textContent||"").trim();
  if(tag==="H1"){
   if(currentChapter){if(!sawHeading1&&!sawHeading2&&currentChapter.title==="Chapter One")currentChapter.title="Introduction";finishChapter();}
   startChapter(title||("Chapter "+(chapters.length+1)));sawHeading1=true;return;
  }
  if(tag==="H2"){
   if(!currentChapter)startChapter("Chapter One");finishScene();currentScene=importedScene(title||("Section "+(currentChapter.scenes.length+1)));sawHeading2=true;return;
  }
  ensureScene();currentScene.content+=node.outerHTML+"\n";
 });
 finishChapter();
 if(!chapters.length){startChapter("Chapter One");currentScene=importedScene("First Section");finishChapter();}
 var book={id:id(),title:importTitleFromFilename(fileName),chapters:chapters};
 var wordCount=chapters.reduce(function(total,chapter){return total+chapter.scenes.reduce(function(count,section){return count+words(txt(section.content));},0);},0);
 var sectionCount=chapters.reduce(function(total,chapter){return total+chapter.scenes.length;},0);
 return{book:book,warnings:Array.from(new Set(warnings)),hasTables:hasTables,hasImages:hasImages,hasFootnotes:hasFootnotes,hasHeadings:!!(h1Count||h2Count),wordCount:wordCount,sectionCount:sectionCount};
}
async function readDocxFile(file){
 if(!/\.docx$/i.test(file.name)){toast("Choose a Microsoft Word .docx file.");return;}
 var request=++importRequest;pendingDocxImport=null;$("importTitle").value=importTitleFromFilename(file.name);$("importFilename").textContent=file.name;$("importStatus").textContent="Reading the document in this browser…";$("importWarnings").hidden=true;$("importWarningList").innerHTML="";$("confirmImport").disabled=true;
 if(!importDialog.open)importDialog.showModal();
 try{
  var mammoth=await loadMammoth();
  var result=await mammoth.convertToHtml({arrayBuffer:await file.arrayBuffer()},{styleMap:["u => u"],includeEmbeddedStyleMap:false,ignoreEmptyParagraphs:false,convertImage:mammoth.images.imgElement(function(){return Promise.resolve({alt:""});})});
  if(request!==importRequest||!importDialog.open)return;
  var parsed=buildImportedBook(file.name,result.value,result.messages);pendingDocxImport=parsed;var warnings=parsed.warnings.slice();
  if(!parsed.wordCount)warnings.push("No readable words were found. You can still import this as a blank manuscript.");
  $("importStatus").textContent=parsed.book.chapters.length+" chapter"+(parsed.book.chapters.length===1?"":"s")+" · "+parsed.sectionCount+" section"+(parsed.sectionCount===1?"":"s")+" · "+parsed.wordCount.toLocaleString()+" words. Review the notes, then import when ready.";
  if(warnings.length){$("importWarningList").innerHTML=warnings.map(function(warning){return"<li>"+esc(warning)+"</li>";}).join("");$("importWarnings").hidden=false;}
  $("confirmImport").disabled=false;
 }catch(error){
  if(request!==importRequest||!importDialog.open)return;
  $("importStatus").textContent="This Word document could not be read. Try opening it in Word and saving it as a fresh .docx file.";$("importWarnings").hidden=true;$("confirmImport").disabled=true;console.error("Word manuscript import failed",error);
 }
}
function confirmDocxImport(){
 if(!pendingDocxImport)return;
 var parsed=pendingDocxImport,title=$("importTitle").value.trim().slice(0,120)||parsed.book.title;
 sync();clearTimeout(timer);parsed.book.title=title;data.books.push(parsed.book);data.bookId=parsed.book.id;data.chapterId=parsed.book.chapters[0].id;data.sceneId=parsed.book.chapters[0].scenes[0].id;pendingDocxImport=null;
 importDialog.close();renderOutline();renderEditor();save();toast('Imported "'+title+'" as a new manuscript.');
}
function exportText(){sync();var b=currentBook(),parts=[b.title];b.chapters.forEach(function(c){parts.push("\n\n"+c.title);c.scenes.forEach(function(s){parts.push("\n\n"+s.title+"\n\n"+txt(s.content));});});download(b.title.replace(/[^a-z0-9-_]+/gi,"-")+".txt",parts.join(""),"text/plain;charset=utf-8");toast("Manuscript exported.");}
function printPdf(){sync();save();var b=currentBook();if(!b)return;var print=$("printSheet");print.innerHTML='<h1 class="print-manuscript-title">'+esc(b.title)+'</h1>'+b.chapters.map(function(c){return '<section class="print-chapter"><h2>'+esc(c.title)+'</h2>'+c.scenes.map(function(s){return '<section class="print-section"><h3>'+esc(s.title)+'</h3><div class="print-writing">'+cleanHtml(s.content)+'</div></section>';}).join("")+'</section>';}).join("");window.print();}
function backup(){sync();save();download("writers-archive-backup-"+new Date().toISOString().slice(0,10)+".json",JSON.stringify(data,null,2),"application/json");toast("Backup downloaded.");}
function restore(file){var r=new FileReader();r.onload=function(){try{var replacement=normalize(JSON.parse(String(r.result||"")));if(!window.confirm("Restore this backup? It will replace the current archive. A safety backup of your existing writing will download first."))return;sync();download("writers-archive-before-restore-"+new Date().toISOString().slice(0,10)+".json",JSON.stringify(data,null,2),"application/json");data=replacement;ensure();renderAll();save();toast("Backup restored. Check cloud sync status.");}catch(e){toast("That backup could not be opened.");}};r.readAsText(file);}
function renderAll(){ensure();renderOutline();renderEditor();searchArchive();status("Saved on this device");}
function closeSearch(){var results=$("searchResults");results.hidden=true;results.innerHTML="";}
function searchArchive(){var input=$("search"),results=$("searchResults"),raw=input.value.trim(),q=raw.toLowerCase(),matches=[],limit=12;if(q.length<2){closeSearch();return;}function add(kind,title,detail,ids){if(matches.length<limit)matches.push({kind:kind,title:title,detail:detail,ids:ids||{}});}function has(value){return String(value||"").toLowerCase().includes(q);}data.books.forEach(function(b){if(has(b.title))add("book",b.title,"Manuscript",{book:b.id});b.chapters.forEach(function(c){if(has(c.title))add("chapter",c.title,b.title+" · Chapter",{book:b.id,chapter:c.id});c.scenes.forEach(function(s){if(has(s.title)||has(txt(s.content)))add("scene",s.title,b.title+" · "+c.title,{book:b.id,chapter:c.id,scene:s.id});});});});["subjects","places","notes","sources"].forEach(function(kind){var label={subjects:"Subject",places:"Place",notes:"Note",sources:"Source"}[kind];(data[kind]||[]).forEach(function(entry){var terms=kind==="sources"?[entry.title,entry.type,entry.author,entry.publication,entry.date,entry.locator,entry.url,entry.quote,entry.details]:[entry.title,entry.details];if(terms.some(has)){var detail=kind==="sources"?[entry.type,entry.author,entry.publication].filter(Boolean).join(" · ")||label:entry.details||label;add(kind,entry.title,detail,{entry:entry.id});}});});if(!matches.length){results.innerHTML='<p class="search-empty">No matches for “'+esc(raw)+'”.</p>';}else{results.innerHTML=matches.map(function(item){var ids=Object.keys(item.ids).map(function(key){return'data-'+key+'-id="'+esc(item.ids[key])+'"';}).join(" ");return'<button type="button" class="search-result" data-search-kind="'+esc(item.kind)+'" '+ids+'><span class="search-result-title">'+esc(item.title)+'</span><span class="search-result-detail">'+esc(item.detail)+'</span></button>';}).join("");}results.hidden=false;}
function openSearchResult(button){var kind=button.dataset.searchKind,b=null,c=null,s=null;closeSearch();if(kind==="book"||kind==="chapter"||kind==="scene"){b=data.books.find(function(item){return item.id===button.dataset.bookId;});if(!b)return;c=b.chapters.find(function(item){return item.id===button.dataset.chapterId;})||b.chapters[0];s=c.scenes.find(function(item){return item.id===button.dataset.sceneId;})||c.scenes[0];sync();data.bookId=b.id;data.chapterId=c.id;data.sceneId=s.id;switchView("write");save();return;}var entryId=button.dataset.entryId;if(!entryId)return;switchView(kind);var card=Array.from($("collection").querySelectorAll("[data-archive-entry]")).find(function(item){return item.dataset.archiveEntry===entryId;});if(card){card.scrollIntoView({behavior:"smooth",block:"center"});card.classList.add("search-highlight");card.focus({preventScroll:true});setTimeout(function(){card.classList.remove("search-highlight");},1800);}}

document.querySelectorAll(".nav-button").forEach(function(b){b.addEventListener("click",function(){switchView(b.dataset.view);});});
$("bookList").addEventListener("click",function(e){var remove=e.target.closest("[data-delete-book]");if(remove){deleteBook(remove.dataset.deleteBook);return;}var b=e.target.closest("[data-book]");if(!b)return;sync();var bookPick=data.books.find(function(q){return q.id===b.dataset.book;});if(!bookPick)return;data.bookId=bookPick.id;data.chapterId=bookPick.chapters[0].id;data.sceneId=bookPick.chapters[0].scenes[0].id;switchView("write");save();});
$("outlineList").addEventListener("click",function(e){var removeScene=e.target.closest("[data-delete-scene]");if(removeScene){deleteScene(removeScene.dataset.chapter,removeScene.dataset.deleteScene);return;}var remove=e.target.closest("[data-delete-chapter]");if(remove){deleteChapter(remove.dataset.deleteChapter);return;}var add=e.target.closest("[data-add-scene]");if(add){openDialog("scene",add.dataset.addScene);return;}var s=e.target.closest("[data-scene]");if(!s)return;sync();data.chapterId=s.dataset.chapter;data.sceneId=s.dataset.scene;renderOutline();renderEditor();save();});
$("newBook").addEventListener("click",function(){openDialog("book");});$("newChapter").addEventListener("click",function(){if(!currentBook()){toast("Create a manuscript first.");return;}openDialog("chapter");});
$("importManuscript").addEventListener("click",function(){$("manuscriptFile").click();});$("manuscriptFile").addEventListener("change",function(event){var file=event.target.files&&event.target.files[0];event.target.value="";if(file)readDocxFile(file);});
function cancelDocxImport(){importRequest++;pendingDocxImport=null;if(importDialog.open)importDialog.close();}
$("closeImport").addEventListener("click",cancelDocxImport);$("cancelImport").addEventListener("click",cancelDocxImport);importDialog.addEventListener("cancel",function(){importRequest++;pendingDocxImport=null;});$("confirmImport").addEventListener("click",confirmDocxImport);
$("entryForm").addEventListener("submit",submit);$("closeDialog").addEventListener("click",function(){dialog.close();});$("cancelDialog").addEventListener("click",function(){dialog.close();});
$("cancelDelete").addEventListener("click",function(){finishDelete(false);});$("confirmDelete").addEventListener("click",function(){finishDelete(true);});deleteDialog.addEventListener("cancel",function(){pendingDelete=null;});
$("bookTitle").addEventListener("input",function(){var b=currentBook();if(b)b.title=$("bookTitle").value.trim()||"Untitled Manuscript";$("folio").textContent=($("bookTitle").value||"UNTITLED").toUpperCase();renderOutline();later();});
$("sceneTitle").addEventListener("input",function(){var s=currentScene();if(s)s.title=$("sceneTitle").value.trim()||"Untitled Section";renderOutline();later();});
editor.addEventListener("input",function(){sync();counts();later();});editor.addEventListener("paste",function(event){var html=event.clipboardData&&event.clipboardData.getData("text/html");if(!html)return;event.preventDefault();document.execCommand("insertHTML",false,cleanHtml(html));sync();counts();later();});editor.addEventListener("blur",save);
$("toolbar").addEventListener("mousedown",function(e){if(e.target.closest("button"))e.preventDefault();});document.querySelectorAll("[data-command]").forEach(function(b){b.addEventListener("click",function(){editor.focus();var cmd=b.dataset.command;document.execCommand(cmd,false,cmd==="formatBlock"?b.dataset.value:null);sync();later();});});
document.addEventListener("selectionchange",function(){var selection=window.getSelection();if(selection&&!selection.isCollapsed&&selection.anchorNode&&editor.contains(selection.anchorNode)){if(!rememberWordSelection()){rememberedWord="";rememberedRange=null;}return;}if(document.activeElement===editor){rememberedWord="";rememberedRange=null;}});
editor.addEventListener("contextmenu",function(event){var word=rememberWordSelection();if(!word)return;event.preventDefault();openWordLookup(word);});
$("lookupWord").addEventListener("pointerdown",rememberWordSelection);$("lookupWord").addEventListener("click",function(){openWordLookup(rememberedWord||selectedEditorWord());});
$("closeWordLookup").addEventListener("click",function(){wordDialog.close();});
document.querySelectorAll("[data-word-tab]").forEach(function(button){button.addEventListener("click",function(){setWordLookupTab(button.dataset.wordTab);});});
$("wordLookup").addEventListener("click",function(event){var synonym=event.target.closest("[data-lookup-word]");if(synonym)openWordLookup(synonym.dataset.lookupWord);});
wordDialog.addEventListener("close",function(){if(wordLookupController){wordLookupController.abort();wordLookupController=null;}if(rememberedRange){editor.focus({preventScroll:true});var selection=window.getSelection();selection.removeAllRanges();selection.addRange(rememberedRange);}});
$("collection").addEventListener("click",function(e){var add=e.target.closest("#addEntry");if(add){openDialog(view==="library"?"book":view);return;}var deleteManuscript=e.target.closest("[data-delete-book]");if(deleteManuscript){deleteBook(deleteManuscript.dataset.deleteBook);return;}var open=e.target.closest("[data-open-book]");if(open){var b=data.books.find(function(x){return x.id===open.dataset.openBook;});if(!b)return;data.bookId=b.id;data.chapterId=b.chapters[0].id;data.sceneId=b.chapters[0].scenes[0].id;switchView("write");save();return;}var edit=e.target.closest("[data-edit]");if(edit){var old=data[view].find(function(x){return x.id===edit.dataset.edit;});if(old)openDialog(view,"",old);return;}var remove=e.target.closest("[data-remove]");if(remove){var collectionView=view,entry=data[collectionView].find(function(x){return x.id===remove.dataset.remove;});if(!entry)return;requestDelete("Remove entry?",'Remove "'+entry.title+'" from your archive? This cannot be undone.',function(){data[collectionView]=data[collectionView].filter(function(x){return x.id!==entry.id;});save();renderCollection();toast("Entry removed.");});}});
$("backup").addEventListener("click",backup);$("restore").addEventListener("click",function(){$("restoreFile").click();});$("restoreFile").addEventListener("change",function(e){if(e.target.files[0])restore(e.target.files[0]);e.target.value="";});
$("exportText").addEventListener("click",exportText);$("printPdf").addEventListener("click",printPdf);$("focus").addEventListener("click",function(){setFocusMode(!$("shell").classList.contains("focus-mode"));});
$("search").addEventListener("input",searchArchive);$("search").addEventListener("keydown",function(e){if(e.key==="ArrowDown"){var first=$("searchResults").querySelector("[data-search-kind]");if(first){e.preventDefault();first.focus();}}});$("searchResults").addEventListener("click",function(e){var result=e.target.closest("[data-search-kind]");if(result)openSearchResult(result);});document.addEventListener("pointerdown",function(e){if(!e.target.closest(".top-actions"))closeSearch();});
$("syncNow").addEventListener("click",manualSync);
$("paper").addEventListener("pointerup",function(e){if(!$("shell").classList.contains("focus-mode"))return;var r=$("paper").getBoundingClientRect();if(e.clientX-r.left<=48&&e.clientY-r.top<=48)setFocusMode(false);});
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!$("searchResults").hidden){e.preventDefault();closeSearch();$("search").focus();return;}if(e.key==="Escape"&&$("shell").classList.contains("focus-mode")&&!dialog.open&&!wordDialog.open){e.preventDefault();setFocusMode(false);}});
window.addEventListener("pagehide",function(){save();if(cloudReady)pushCloud(true);});document.addEventListener("visibilitychange",function(){if(document.hidden){save();if(currentUser&&cloudReady&&localStorage.getItem(activeKey(PENDING_KEY))==="1")pushCloud(true);}else if(cloudReady)manualSync();});
initAuth();
})();
