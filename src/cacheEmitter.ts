import { EventEmitter } from './eventEmitter';

export class CacheEmitter {
  protected _emitter = new EventEmitter();

  /**
   * Кешированный вызов метода. Если в процессе исполнения метода, вызывается этот метод еще раз,
   * то не произовдит дополнительных запросов, а ожидает выполнение первого по ключу.
   * Как только реальный запрос исполнится, вернет ответ всем остальным.
   * @param eventName Ключ, по которому определяется уникальность кешированных вызовов
   * @param realCallback Настоящий вызов метода. Вызвается единожды для кешированного вызова
   */
  public call<Result>(eventName: string, realCallback: () => Result | Promise<Result>): Promise<Result> {
    return new Promise((resolve, reject) => {
      const responseCall = (type: 'resolve' | 'reject', data: Result) => {
        if (type === 'resolve') return resolve(data);
        return reject(data);
      };
      const hasEvent = this._emitter.hasEvent(eventName);
      const eventHash = this._emitter.on(eventName, ({ data, type }) => {
        responseCall(type, data);
        if (this._emitter.has(eventHash)) this._emitter.off(eventHash);
      });
      if (!hasEvent) {
        Promise.resolve()
          .then(() => realCallback())
          .then(result => this._emitter.emitAsync<any>(eventName, { data: result, type: 'resolve' }))
          .catch(err => this._emitter.emitAsync<any>(eventName, { data: err, type: 'resolve' }));
      }
    });
  }

  /**
   * Кешированный подписка. Если подписка уже зарегистрирована, начинает прослушивать без дополнительной подписки.
   * Если подписки нет, то вызывает метод главной подписки и после вызывает метод кешированной подписки
   * @param eventName Ключ, по которому определяется уникальность кешированных вызовов
   * @param callCallback Настоящий вызов метода подписки. Вызвается единожды для кешированной подписки
   * @param cacheCallback Метод кешированной подписки
   */
  public subscribe<Result>(
    eventName: string,
    realCallback: (callback: (data: Result) => void) => (() => void) | Promise<() => void>,
    cacheCallback: (data: Result) => void,
  ) {
    const hasEvent = this._emitter.hasEvent(eventName);
    const eventHash = this._emitter.on(eventName, cacheCallback);
    if (!hasEvent) {
      let unlistenerPromise = Promise.resolve().then(() =>
        realCallback(data => {
          this._emitter.emitAsync<any>(eventName, data);
        }),
      );
      const triggerOffEventHash = this._emitter.triggerOffEvent(eventName, async () => {
        let unlistener = unlistenerPromise && (await unlistenerPromise);
        if (unlistener) {
          unlistener();
          unlistener = null;
          unlistenerPromise = null;
        }
        this._emitter.off(triggerOffEventHash);
      });
    }
    return eventHash;
  }

  public unsubscribe(eventHash: string) {
    this._emitter.off(eventHash);
  }
}
