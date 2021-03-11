import { EventEmitter } from '../eventEmitter';
import { CacheEmitter } from '../cacheEmitter';

class TestEmitter<EventMap extends { [eventName: string]: any }> extends EventEmitter<EventMap> {
  static createTestEmitter<EventMap extends { [eventName: string]: any }>() {
    const emitter = new TestEmitter<EventMap>();
    return emitter;
  }

  public get testEvents() {
    return this._events;
  }

  public get testStates() {
    return this._states;
  }
}

class TestCacheEmitter extends CacheEmitter {
  static createTestEmitter() {
    const emitter = new TestCacheEmitter();
    return emitter;
  }

  public get testEvents() {
    return this._emitter['_events'];
  }

  public get testStates() {
    return this._emitter['_states'];
  }
}

describe('test emitter', () => {
  test('on', done => {
    const emitter = TestEmitter.createTestEmitter();
    const testCallback = () => {};

    const eventHash1 = emitter.on('test1', () => {});
    const eventHash2 = emitter.on('test2', testCallback);
    const eventHash3 = emitter.on('test3', testCallback);
    const eventHash4 = emitter.on('test3', () => {});

    expect(emitter.testEvents.length).toBe(4);
    expect(emitter.testEvents.filter(m => m.eventName === 'test3').length).toBe(2);
    expect(emitter.testEvents.filter(m => m.callback === testCallback).length).toBe(2);

    done();
  });

  test('off & offEvent & offAll', done => {
    const emitter = TestEmitter.createTestEmitter();
    const testCallback = () => {};

    const eventHash1 = emitter.on('test1', () => {});
    const eventHash2 = emitter.on('test2', testCallback);
    const eventHash3 = emitter.on('test3', testCallback);
    const eventHash4 = emitter.on('test3', () => {});

    expect(emitter.testEvents.length).toBe(4);

    emitter.off(eventHash1);

    expect(emitter.testEvents.length).toBe(3);
    expect(emitter.testEvents.filter(m => m.eventName === 'test1').length).toBe(0);

    emitter.offEvent('test3');

    expect(emitter.testEvents.map(m => m.eventHash)).toEqual([eventHash2]);

    emitter.offAll();
    expect(emitter.testEvents.length).toBe(0);

    done();
  });

  test('has & hasEvent & hasCallback', done => {
    const emitter = TestEmitter.createTestEmitter();
    const testCallback = () => {};

    const eventHash1 = emitter.on('test1', () => {});
    const eventHash2 = emitter.on('test2', testCallback);
    const eventHash3 = emitter.on('test3', testCallback);
    const eventHash4 = emitter.on('test3', () => {});

    expect(emitter.testEvents.length).toBe(4);

    expect(emitter.hasEvent('test1')).toBeTruthy();
    expect(emitter.hasEvent('test2')).toBeTruthy();
    expect(emitter.hasEvent('test3')).toBeTruthy();
    expect(emitter.hasEvent('test4')).toBeFalsy();

    expect(emitter.has('test1')).toBeFalsy();
    expect(emitter.has(eventHash1)).toBeTruthy();
    expect(emitter.has(eventHash2)).toBeTruthy();
    expect(emitter.has(eventHash3)).toBeTruthy();
    expect(emitter.has(eventHash4)).toBeTruthy();

    expect(emitter.hasCallback(() => {})).toBeFalsy();
    expect(emitter.hasCallback(testCallback)).toBeTruthy();

    emitter.offEvent('test3');

    expect(emitter.hasEvent('test3')).toBeFalsy();
    expect(emitter.hasEvent('test1')).toBeTruthy();
    expect(emitter.has(eventHash1)).toBeTruthy();
    expect(emitter.has(eventHash3)).toBeFalsy();
    expect(emitter.hasCallback(testCallback)).toBeTruthy();

    done();
  });

  test('emitSync & emitAsync', async done => {
    let test1Called1 = false;
    let test1Called2 = false;
    let test2Called = false;
    const emitter = TestEmitter.createTestEmitter();

    emitter.on('test1', data => {
      test1Called1 = data;
    });
    emitter.on('test1', data => {
      test1Called2 = data;
    });

    emitter.on('test2', data => {
      test2Called = data;
    });

    emitter.emitSync('test1', true);

    expect(test1Called1).toBeTruthy();
    expect(test1Called2).toBeTruthy();
    expect(test2Called).toBeFalsy();

    test1Called1 = false;
    test1Called2 = false;
    emitter.offAll();

    emitter.on('test1', () => {
      test1Called1 = true;
    });
    emitter.on('test1', () => {
      test1Called2 = true;
    });

    emitter.on('test2', async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      test2Called = true;
    });

    await emitter.emitAsync('test2', true);

    expect(test1Called1).toBeFalsy();
    expect(test1Called2).toBeFalsy();
    expect(test2Called).toBeTruthy();

    done();
  });

  test('createNewEmitter', async done => {
    const emitter = TestEmitter.createTestEmitter();
    const testCallback = () => {};

    emitter.on('test1', () => {});
    emitter.on('test1', testCallback);
    emitter.on('test2', testCallback);

    expect(emitter.testEvents.length).toBe(3);
    expect(emitter.createNewEmitter().testEvents.length).toBe(3);
    expect(emitter.createNewEmitter(data => data).testEvents.length).toBe(3);
    expect(emitter.createNewEmitter(data => data.filter(m => m.eventName === 'test1')).testEvents.length).toBe(2);
    expect(emitter.createNewEmitter(data => data.filter(m => m.callback === testCallback)).testEvents.length).toBe(2);

    done();
  });

  test('cacheEmitter', async done => {
    const emitter = TestCacheEmitter.createTestEmitter();
    let count = 0;
    const testCallback = async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      count += 1;
      return 'test';
    };

    const results = await Promise.all([emitter.call('query1', testCallback), emitter.call('query1', testCallback)]);

    expect(results).toEqual(['test', 'test']);
    expect(count).toBe(1);

    done();
  });

  test('cacheSubscribe', async done => {
    const intervalSubscribe = (callback: () => void) => {
      const timer = setInterval(callback, 100);
      return () => {
        clearInterval(timer);
      };
    };

    const emitter = TestCacheEmitter.createTestEmitter();
    let testStringRaw = '';
    let testStringCache = '';
    let isListinig = false;

    const call = () => {
      const eventHash = emitter.subscribe(
        'query1',
        callback => {
          return Promise.resolve().then(() => {
            let unlistener = intervalSubscribe(() => {
              const data = '1';
              testStringRaw = `${testStringRaw} ${data}`.trim();
              callback(data);
            });
            isListinig = true;
            return () => {
              unlistener();
              isListinig = false;
            };
          });
        },
        (data: string) => {
          testStringCache = `${testStringCache} ${data}`.trim();
        },
      );
      return () => emitter.unsubscribe(eventHash);
    };

    const unlistener1 = call();
    const unlistener2 = call();

    await new Promise(resolve => setTimeout(resolve, 200));

    expect(emitter.testEvents.length).toBe(2);
    expect(testStringRaw).toBe('1');
    expect(testStringCache).toBe('1 1');
    expect(isListinig).toBe(true);

    unlistener1();

    await new Promise(resolve => setTimeout(resolve, 200));

    expect(emitter.testEvents.length).toBe(1);
    expect(testStringRaw).toBe('1 1 1');
    expect(testStringCache).toBe('1 1 1 1');
    expect(isListinig).toBe(true);

    unlistener2();

    await new Promise(resolve => setTimeout(resolve, 200));

    expect(emitter.testEvents.length).toBe(0);
    expect(testStringRaw).toBe('1 1 1');
    expect(testStringCache).toBe('1 1 1 1');
    expect(isListinig).toBe(false);

    done();
  });

  test('check state', async done => {
    let test1Called1 = false;
    let test1Called2 = false;
    let test2Called1 = false;
    let test2Called2 = false;
    const emitter = TestEmitter.createTestEmitter();

    emitter.on('test1', data => {
      test1Called1 = data;
    });

    emitter.on('test2', data => (test2Called1 = data));

    emitter.emitStateSync('test1', true);
    emitter.emitSync('test2', true);

    emitter.on('test1', data => {
      test1Called2 = data;
    });
    emitter.on('test2', data => (test2Called2 = data));

    expect(test1Called1).toBeTruthy();
    expect(test1Called2).toBeTruthy();
    expect(test2Called1).toBeTruthy();
    expect(test2Called2).toBeFalsy();

    emitter.offAll();

    done();
  });

  test('off triggers', done => {
    let offTest1Called = false;
    let offTest1EventCalled = false;
    let offTest2Called = false;
    let offTest2EventCalled = false;
    let offAllCalled = false;

    const emitter = TestEmitter.createTestEmitter();

    const test1Hash = emitter.on('test1', () => {});
    const test2Hash = emitter.on('test2', () => {});

    emitter.triggerOff(test1Hash, () => (offTest1Called = true));
    emitter.triggerOff(test2Hash, () => (offTest2Called = true));
    emitter.triggerOffEvent('test1', () => (offTest1EventCalled = true));
    emitter.triggerOffEvent('test2', () => (offTest2EventCalled = true));
    emitter.triggerOffAll(() => (offAllCalled = true));

    emitter.off(test1Hash);

    expect(offTest1Called).toBeTruthy();
    expect(offTest1EventCalled).toBeTruthy();
    expect(offTest2Called).toBeFalsy();
    expect(offTest2EventCalled).toBeFalsy();
    expect(offAllCalled).toBeFalsy();

    emitter.offEvent('test2');

    expect(offTest2Called).toBeTruthy();
    expect(offTest2EventCalled).toBeTruthy();
    expect(offAllCalled).toBeTruthy();

    done();
  });

  test('wait event timeout', async done => {
    const emitter = TestEmitter.createTestEmitter();

    emitter.emitStateSync('test1', true);

    const test1Data = await emitter.waitEventTimeout('test1');
    const test2Data = await emitter.waitEventTimeout('test2');
    const test3Data = await emitter
      .waitEventTimeout('test3', 0, () => 'timeout')
      .then(() => false)
      .catch(data => data);

    setTimeout(() => emitter.emitStateSync('test4', true), 500);
    const test4Data = await emitter
      .waitEventTimeout('test4', 0, () => 'timeout')
      .then(data => data)
      .catch(data => data);

    setTimeout(() => emitter.emitStateSync('test5', true), 100);
    const test5Data = await emitter
      .waitEventTimeout('test4', 500, () => 'timeout')
      .then(data => data)
      .catch(data => data);

    expect(test1Data).toBeTruthy();
    expect(test2Data).toBeUndefined();
    expect(test3Data).toBe('timeout');
    expect(test4Data).toBe('timeout');
    expect(test5Data).toBeTruthy();

    done();
  });
});
