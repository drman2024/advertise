(function(){
function applyZoom(level){
  document.body.style.zoom = level + "%";
  try{ localStorage.setItem("elanaty_zoom", String(level)); }catch(e){}
}
function currentZoom(){
  try{ return parseInt(localStorage.getItem("elanaty_zoom"),10) || 100; }catch(e){ return 100; }
}
document.addEventListener("DOMContentLoaded", function(){
  applyZoom(currentZoom());
  var inc = document.getElementById("fontIncBtn");
  var dec = document.getElementById("fontDecBtn");
  if(inc) inc.onclick = function(){ applyZoom(Math.min(140, currentZoom()+10)); };
  if(dec) dec.onclick = function(){ applyZoom(Math.max(80, currentZoom()-10)); };
});
})();
