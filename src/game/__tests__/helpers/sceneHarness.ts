import { EventEmitter } from 'node:events';
import { registerHooks } from 'node:module';
import type { TestContext } from 'node:test';
import type { SixShotScene } from '../../scenes/SixShotScene.ts';

// Replace only the browser renderer. The scenes, target managers, sampler, and
// telemetry collector below are the production modules used by the application.
export async function loadGameScenes() {
  const rendererStub = 'data:text/javascript,' + encodeURIComponent(`
    export default {
      Scene: class {},
      Math: { Clamp: (value, min, max) => Math.max(min, Math.min(max, value)) },
      Scenes: { Events: { SHUTDOWN: 'shutdown', DESTROY: 'destroy' } }
    };
  `);
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      return specifier === 'phaser'
        ? { url: rendererStub, shortCircuit: true }
        : nextResolve(specifier, context);
    },
  });
  try {
    return {
      ...await import('../../scenes/SixShotScene.ts'),
      ...await import('../../scenes/MovingTargetsScene.ts'),
      ...await import('../../scenes/ThirtyShotScene.ts'),
    };
  } finally {
    hooks.deregister();
  }
}

class DisplayObject {
  x: number;
  y: number;
  text: string;
  visible = true;
  destroyed = false;
  children: DisplayObject[];
  parent: DisplayObject | null = null;
  originX = 0;
  originY = 0;

  constructor(x = 0, y = 0, text = '', children: DisplayObject[] = []) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.children = children;
    for (const child of children) child.parent = this;
  }

  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setText(text: string) { this.text = text; return this; }
  setVisible(visible: boolean) { this.visible = visible; return this; }
  setOrigin(x: number, y = x) { this.originX = x; this.originY = y; return this; }
  add(child: DisplayObject) { this.children.push(child); child.parent = this; return this; }
  getBounds() {
    let worldX = this.x;
    let worldY = this.y;
    for (let parent = this.parent; parent; parent = parent.parent) {
      worldX += parent.x;
      worldY += parent.y;
    }
    const width = Math.max(1, this.text.length * 8);
    const height = 32;
    const left = worldX - this.originX * width;
    const top = worldY - this.originY * height;
    return {
      centerX: left + width / 2,
      centerY: top + height / 2,
      contains: (x: number, y: number) =>
        x >= left && x <= left + width && y >= top && y <= top + height,
    };
  }
  destroy() {
    this.destroyed = true;
    for (const child of this.children) child.destroy();
  }
}

function displayObject(x = 0, y = 0, text = '', children: DisplayObject[] = []) {
  return new Proxy(new DisplayObject(x, y, text, children), {
    get(target, key, receiver) {
      // Drawing and fluent styling are inert; positions, text, visibility, and
      // destruction remain observable for the scene integration assertions.
      return key in target ? Reflect.get(target, key, receiver) : () => receiver;
    },
  });
}

export function sceneValue<T>(scene: SixShotScene, key: string): T {
  return Reflect.get(scene, key) as T;
}

export function attachSceneHarness(scene: SixShotScene, t: TestContext) {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const documentEvents = new EventEmitter();
  const canvas = new EventTarget();
  const events = new EventEmitter();
  const downloads: { filename: string; url: string }[] = [];
  const scale = Object.assign(new EventEmitter(), { width: 900, height: 600 });
  const input = Object.assign(new EventEmitter(), {
    mouse: {
      locked: false,
      requestPointerLock() {
        input.mouse.locked = true;
        documentStub.pointerLockElement = canvas;
        documentEvents.emit('pointerlockchange');
      },
      releasePointerLock() { documentStub.exitPointerLock(); },
    },
  });
  const documentStub = {
    pointerLockElement: null as EventTarget | null,
    addEventListener: (event: string, listener: () => void) => documentEvents.on(event, listener),
    removeEventListener: (event: string, listener: () => void) => documentEvents.off(event, listener),
    exitPointerLock() {
      input.mouse.locked = false;
      documentStub.pointerLockElement = null;
      documentEvents.emit('pointerlockchange');
    },
    body: { appendChild() {} },
    createElement(tag: string) {
      if (tag !== 'a') throw new Error(`Unexpected element: ${tag}`);
      return {
        href: '', download: '', style: { display: '' },
        click() { downloads.push({ filename: this.download, url: this.href }); },
        remove() {},
      };
    },
  };
  Object.defineProperty(globalThis, 'document', { value: documentStub, configurable: true });

  Object.assign(scene, {
    events, scale, input,
    game: { canvas, registry: { get: () => () => events.emit('destroy') } },
    cameras: { main: { setBackgroundColor() {} } },
    textures: { exists: () => false },
    add: {
      graphics: () => displayObject(),
      tileSprite: (x: number, y: number) => displayObject(x, y),
      rectangle: (x: number, y: number) => displayObject(x, y),
      text: (x: number, y: number, text: string) => displayObject(x, y, text),
      image: (x: number, y: number) => displayObject(x, y),
      container: (x: number, y: number, children: DisplayObject[] = []) => displayObject(x, y, '', children),
    },
    tweens: { add: (config: { onComplete?: () => void }) => config.onComplete?.() },
    time: { delayedCall: (_delay: number, callback: () => void) => callback() },
  });
  t.after(() => {
    events.emit('shutdown');
    events.emit('destroy');
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  scene.create();

  const click = (x = scale.width / 2, y = scale.height / 2) =>
    input.emit('pointerdown', { worldX: x, worldY: y });
  return {
    canvas, events, scale, input, documentEvents, document: documentStub, downloads,
    click,
    start: () => click(),
    move(dx: number, dy: number) {
      input.emit('pointermove', { movementX: dx, movementY: dy });
      canvas.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: dx, movementY: dy }));
    },
    resize(width: number, height: number) {
      scale.width = width;
      scale.height = height;
      scale.emit('resize', { width, height });
    },
  };
}
