import { Application, Text, TextStyle } from 'pixi.js';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app');

const app = new Application({
  width: 1280,
  height: 720,
  backgroundColor: 0x0b0f1a,
  antialias: true,
});
root.appendChild(app.view as HTMLCanvasElement);

const hello = new Text(
  'Hello PixiJS v7',
  new TextStyle({ fontFamily: 'system-ui', fontSize: 48, fill: '#facc15', fontWeight: '900' })
);
hello.anchor.set(0.5);
hello.position.set(640, 360);
app.stage.addChild(hello);