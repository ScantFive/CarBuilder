import './style.css';
import { Editor } from './editor/Editor';
import type { CarDesign } from './model/car';
import { CarStorage } from './storage/carStorage';

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

const editor = new Editor(editorRoot, storage, (c) => showTestDrive(c));

function showEditor(): void {
  editor.setActive(true);
}

function showTestDrive(c: CarDesign): void {
  console.info('test drive', c.name);
}

showEditor();
