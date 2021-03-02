import LINQ from '@berish/linq';
import guid from 'berish-guid';

export type SubscribeType<Data> = (data: Data, eventHash: string) => void | Promise<void>;

export type EventNameType = string | number | symbol;

export type EmitterMapBaseType = {
  [name: string]: any;
  [name: number]: any;
};

export interface EventObject<Data> {
  eventName: EventNameType;
  eventHash: string;
  callback: SubscribeType<Data>;
}

export interface StateObject<Data> {
  stateName: EventNameType;
  data: Data;
}

export class EventEmitter<
  EventMap extends EmitterMapBaseType = EmitterMapBaseType,
  StateMap extends EmitterMapBaseType = EmitterMapBaseType
> {
  protected _events: EventObject<any>[] = [];
  protected _states: StateObject<any>[] = [];

  /**
   * Прослушивание события
   * @param eventName Название события
   * @param callback Обратный вызов
   */
  public on<EventName extends keyof EventMap>(eventName: EventName, callback: SubscribeType<EventMap[EventName]>): string;
  public on<StateName extends keyof StateMap>(eventName: StateName, callback: SubscribeType<StateMap[StateName]>): string;
  public on(eventName: string, callback: SubscribeType<any>): string {
    const eventHash = guid.guid();
    this._events.push({ eventName, eventHash, callback });

    if (this.hasState(eventName)) {
      const stateEvent = LINQ.from(this._states).first(m => m.stateName === eventName);
      callback(stateEvent.data, eventHash);
    }

    return eventHash;
  }

  /**
   * Возвращает Promise в ожидании срабатывания события
   * @param eventName Название события
   * @param stateName Название этапа
   */
  public waitEvent<EventName extends keyof EventMap>(eventName: EventName): Promise<EventMap[EventName]>;
  public waitEvent<StateName extends keyof StateMap>(stateName: StateName): Promise<StateMap[StateName]>;
  public waitEvent<EventName extends keyof EventMap>(eventName: EventName): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      this.on(eventName, (data, eventHash) => {
        try {
          resolve(data);
        } catch (err) {
          reject(err);
        } finally {
          this.off(eventHash);
        }
      });
    });
  }

  /**
   * Прекратить прослушивание всех событий
   */
  public offAll(): void {
    this._events = [];
  }

  /**
   * Прекратить прослушивать событие конкретного идентификатора
   * @param eventHash Уникальный идентификатор события прослушивания
   */
  public off(eventHash: string): void {
    const currentEvent = this._events.filter(m => m.eventHash === eventHash)[0];
    const currentEventName = currentEvent && currentEvent.eventName;
    this._events = this._events.filter(m => m.eventHash !== eventHash);
    this.emitSync(`off_${eventHash}`);
    if (currentEventName && this._events.filter(m => m.eventName === currentEventName).length <= 0) {
      this.emitSync(`off_event_${currentEventName.toString()}`);
    }
  }

  /**
   * Прекращает прослушивать конкретное событие
   * @param eventName
   */
  public offEvent(eventName: keyof EventMap): void;
  public offEvent(stateName: keyof StateMap): void;
  public offEvent(eventName: any): void {
    this._events = this._events.filter(m => m.eventName !== eventName);
    this.emitSync(`off_event_${eventName}`);
  }

  public triggerOff(eventHash: string, callback: () => void): string {
    return this.on(`off_${eventHash}`, callback);
  }

  public triggerOffEvent(eventName: keyof EventMap, callback: () => void): string {
    return this.on(`off_event_${eventName}`, callback);
  }

  public getEvents<EventName extends keyof EventMap>(eventName: EventName): EventObject<EventMap[EventName]>[];
  public getEvents<StateName extends keyof StateMap>(stateName: StateName): EventObject<StateMap[StateName]>[];
  public getEvents(eventName: any): EventObject<any>[] {
    return this._events.filter(m => m.eventName === eventName);
  }

  public emitSync<EventName extends keyof EventMap>(eventName: EventName, data?: EventMap[EventName]): void;
  public emitSync<StateName extends keyof StateMap>(stateName: StateName, data?: StateMap[StateName]): void;
  public emitSync(eventName: any, data?: any): void {
    const events = this.getEvents(eventName);
    events.map(event => event.callback(data, event.eventHash));
  }

  public async emitAsync<EventName extends keyof EventMap>(eventName: EventName, data?: EventMap[EventName]): Promise<void>;
  public async emitAsync<StateName extends keyof StateMap>(stateName: StateName, data?: StateMap[StateName]): Promise<void>;
  public async emitAsync(eventName: string, data?: any): Promise<void> {
    const events = this.getEvents(eventName);
    await Promise.all(events.map(event => event.callback(data, event.eventHash)));
  }

  public emitStateSync<StateName extends keyof StateMap>(stateName: StateName, data: StateMap[StateName]) {
    if (this.hasState(stateName)) this.removeState(stateName);
    this._states.push({ stateName, data });

    this.emitSync(stateName, data);
  }

  public async emitStateAsync<StateName extends keyof StateMap>(stateName: StateName, data: StateMap[StateName]): Promise<void> {
    if (this.hasState(stateName)) this.removeState(stateName);
    this._states.push({ stateName, data });

    await this.emitAsync(stateName, data);
  }

  public removeState<StateName extends keyof StateMap>(stateName: StateName) {
    this._states = this._states.filter(m => m.stateName !== stateName);
  }

  public createNewEmitter(filter?: (eventObjects: EventObject<any>[]) => EventObject<any> | EventObject<any>[]): this {
    const cls: new () => this = this.constructor as any;
    const emitter = new cls();
    const newEvents = filter ? filter(this._events) : [...this._events];
    emitter._events = Array.isArray(newEvents) ? newEvents : [newEvents];
    return emitter;
  }

  public has(eventHash: string): boolean {
    return this._events.some(m => m.eventHash === eventHash);
  }

  public hasState<StateName extends keyof StateMap>(stateName: StateName) {
    return this._states.some(m => m.stateName === stateName);
  }

  public hasEvent(eventName: keyof EventMap): boolean {
    return this._events.some(m => m.eventName === eventName);
  }

  public hasCallback(callback: SubscribeType<any>): boolean {
    return this._events.some(m => m.callback === callback);
  }

  /**
   * Кешированный вызов метода. Если событие уже зарегистрировано, начинает прослушивать событие без дополнительных вызовов.
   * Если события нет, то получает ответ и отправляет всем, кто прослушивает это же событие
   * @param eventName Ключ, по которому определяется уникальность кешированных вызовов
   * @param callback Настоящий вызов метода. Вызвается единожды для кешированного вызова
   */
  public cacheCall<Result>(eventName: string, callback: () => Result | Promise<Result>): Promise<Result> {
    return new Promise((resolve, reject) => {
      const responseCall = (type: 'resolve' | 'reject', data: Result) => {
        if (type === 'resolve') return resolve(data);
        return reject(data);
      };
      const hasEvent = this.hasEvent(eventName);
      const eventHash = this.on(eventName, ({ data, type }) => {
        responseCall(type, data);
        if (this.has(eventHash)) this.off(eventHash);
      });
      if (!hasEvent) {
        Promise.resolve()
          .then(() => callback())
          .then(result => {
            return this.emitAsync<any>(eventName, { data: result, type: 'resolve' });
          })
          .catch(err => {
            return this.emitAsync<any>(eventName, { data: err, type: 'resolve' });
          });
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
  public cacheSubscribe<Result>(
    eventName: string,
    callCallback: (callback: (data: Result) => void) => (() => void) | Promise<() => void>,
    cacheCallback: (data: Result) => void,
  ) {
    const hasEvent = this.hasEvent(eventName);
    const eventHash = this.on(eventName, cacheCallback);
    if (!hasEvent) {
      let unlistenerPromise = Promise.resolve().then(() =>
        callCallback(data => {
          this.emitAsync<any>(eventName, data);
        }),
      );
      const triggerOffEventHash = this.triggerOffEvent(eventName, async () => {
        let unlistener = unlistenerPromise && (await unlistenerPromise);
        if (unlistener) {
          unlistener();
          unlistener = null;
          unlistenerPromise = null;
        }
        this.off(triggerOffEventHash);
      });
    }
    return eventHash;
  }
}
