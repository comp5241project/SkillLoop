// Add final public submission links here. Never publish personal passwords or API keys.
const resources = { video: null, report: null, slides: null, accessNote: 'App login details: to be confirmed.' };
const modal = document.getElementById('resource-dialog');
const content = document.getElementById('dialog-content');
document.getElementById('access-note').textContent = resources.accessNote;
function show(title, entries) {
  document.getElementById('dialog-title').textContent = title;
  content.replaceChildren();
  entries.forEach(([label, url]) => {
    const item = document.createElement(url ? 'a' : 'p');
    item.textContent = url ? label : label + ': coming soon.';
    if (url) { item.href = url; item.target = '_blank'; item.rel = 'noopener'; }
    content.append(item);
  });
  modal.showModal();
}
const videoButton = document.getElementById('video-button');
const documentsButton = document.getElementById('documents-button');
if(resources.video) videoButton.querySelector('.description').textContent = '6–10 minute app overview';
if(resources.report && resources.slides) documentsButton.querySelector('.description').textContent = 'Final report and presentation';
videoButton.addEventListener('click', () => show('Overview video', [['6–10 minute overview', resources.video]]));
documentsButton.addEventListener('click', () => show('Report & slides', [['Final report', resources.report], ['Presentation slides', resources.slides]]));
document.getElementById('close-dialog').addEventListener('click', () => modal.close());
