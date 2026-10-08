import './style.css';
import { Editor } from './editor/Editor';
import type { CarDesign } from './model/car';
import { CarStorage } from './storage/carStorage';
import { TestDrive } from './sim/TestDrive';
import { BodyEditor } from './body/BodyEditor';

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const app = document.getElementById('app')!;
const storage = new CarStorage(safeLocalStorage());

const editorRoot = document.createElement('div');
editorRoot.className = 'screen';
app.appendChild(editorRoot);

const editor = new Editor(
  editorRoot,
  storage,
  (c) => showTestDrive(c),
  () => showBodyEditor(),
);

const driveRoot = document.createElement('div');
driveRoot.className = 'screen';
driveRoot.hidden = true;
app.appendChild(driveRoot);
let drive: TestDrive | null = null;

function showEditor(): void {
  bodyEditor.setActive(false);
  drive?.dispose();
  drive = null;
  driveRoot.hidden = true;
  editor.setActive(true);
}

function showTestDrive(c: CarDesign): void {
  editor.setActive(false);
  driveRoot.hidden = false;
  drive = new TestDrive(driveRoot, c, storage, () => showEditor());
}

const bodyRoot = document.createElement('div');
bodyRoot.className = 'screen';
bodyRoot.hidden = true;
app.appendChild(bodyRoot);
const bodyEditor = new BodyEditor(bodyRoot, storage, (c) => {
  bodyEditor.setActive(false);
  editor.setDesign(c);
  showEditor();
});

function showBodyEditor(): void {
  editor.setActive(false);
  bodyEditor.open(editor.getDesign());
  bodyEditor.setActive(true);
}

showEditor();
