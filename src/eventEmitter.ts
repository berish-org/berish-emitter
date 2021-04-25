import LINQ from '@berish/linq';
import guid from 'berish-guid';

export type SubscribeType<Data, Result = void | Promise<void>> = (data: Data, eventHash: string) => Result;

export type EventNameType = string | number | symbol;

export type EmitterMapBaseType = {
  [name: string]: any;
  [name: number]: any;
};

export interface EventObject<Data, Result = void | Promise<void>> {
  eventName: EventNameType;
  eventHash: string;
  callback: SubscribeType<Data, Result>;
}

export interface StateObject<Data> {
  stateName: EventNameType;
  data: Data;
}

export class EventEmitter<EventMap extends EmitterMapBaseType = EmitterMapBaseType, StateMap extends EmitterMapBaseType = EmitterMapBaseType> {
  protected _events: EventObject<any>[] = [];
  protected _offTriggers: EventObject<any>[] = [];
  protected _states: StateObject<any>[] = [];

  public createNewEmitter(filter?: (eventObjects: EventObject<any>[]) => EventObject<any> | EventObject<any>[]): this {
    const cls: new () => this = this.constructor as any;
    const emitter = new cls();
    const newEvents = filter ? filter(this._events) : [...this._events];
    emitter._events = Array.isArray(newEvents) ? newEvents : [newEvents];
    return emitter;
  }

  public getEvents<EventName extends keyof EventMap, Result = void | Promise<void>>(eventName: EventName): EventObject<EventMap[EventName], Result>[];
  public getEvents<StateName extends keyof StateMap, Result = void | Promise<void>>(stateName: StateName): EventObject<StateMap[StateName], Result>[];
  public getEvents(eventName: any): EventObject<any>[] {
    return this._events.filter(m => m.eventName === eventName);
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

  public getState<StateName extends keyof StateMap>(stateName: StateName) {
    const item = this._states.find(m => m.stateName === stateName);
    return item && item.data;
  }

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
   * Возвращает Promise в ожидании срабатывания события
   * @param eventName Название события
   * @param stateName Название этапа
   * @param timeout Таймаут ожидания (defaults 0)
   * @param rejectReturn Если передается, то при срабатывании времени таймаута возвращает reject с результатом, который передает эта функция. Если метод не передается, то при срабатывании таймаута возращает resolve
   */
  public waitEventTimeout<EventName extends keyof EventMap>(eventName: EventName, timeout?: number, rejectReturn?: () => any): Promise<EventMap[EventName]>;
  public waitEventTimeout<StateName extends keyof StateMap>(stateName: StateName, timeout?: number, rejectReturn?: () => any): Promise<StateMap[StateName]>;
  public waitEventTimeout<EventName extends keyof EventMap>(eventName: EventName, timeout?: number, rejectReturn?: () => any): Promise<any> {
    const eventPromise = this.waitEvent(eventName);
    const timeoutPromise = new Promise<void>((resolve, reject) =>
      setTimeout(() => {
        if (rejectReturn) reject(rejectReturn());
        else resolve();
      }, timeout || 0),
    );
    return Promise.race([eventPromise, timeoutPromise]);
  }

  /**
   * Прекратить прослушивать событие конкретного идентификатора
   * @param eventHash Уникальный идентификатор события прослушивания
   */
  public off(eventHash: string): void {
    const currentEvent = LINQ.from(this._events).first(m => m.eventHash === eventHash);
    const eventName = currentEvent && (currentEvent.eventName as keyof EventMap);

    this._offAction(eventHash);

    try {
      this._offEmit(eventHash);
      if (this.getEvents(eventName).length <= 0) this._offEventEmit(eventName);
      if (this._events.length <= 0) this._offAllEmit();
    } catch (err) {
      // IGNORE
    }
  }

  /**
   * Прекращает прослушивать конкретное событие
   * @param eventName
   */
  public offEvent(eventName: keyof EventMap): void;
  public offEvent(stateName: keyof StateMap): void;
  public offEvent(eventName: any): void {
    const events = LINQ.from(this.getEvents(eventName)).map(m => m.eventHash);

    this._offEventAction(eventName);

    try {
      events.forEach(eventHash => this._offEmit(eventHash));
      this._offEventEmit(eventName);
      if (this._events.length <= 0) this._offAllEmit();
    } catch (err) {
      // IGNORE
    }
  }

  /**
   * Прекратить прослушивание всех событий
   */
  public offAll(): void {
    const events = LINQ.from(this._events).map(m => m.eventHash);
    const eventNames = LINQ.from(this._events)
      .map(m => m.eventName)
      .distinct(m => m);

    try {
      events.forEach(eventHash => this._offEmit(eventHash));
      eventNames.forEach(eventName => this._offEventEmit(eventName));
      this._offAllEmit();
    } catch (err) {
      // IGNORE
    }
    this._offAllAction();
  }

  public triggerOff(eventHash: string, callback: () => void): string {
    const offName = getOffName(eventHash);

    return this._onTriggerOff(offName, callback);
  }

  public triggerOffEvent(eventName: keyof EventMap, callback: () => void): string {
    const offEventName = getOffEventName(eventName.toString());

    return this._onTriggerOff(offEventName, callback);
  }

  public triggerOffAll(callback: () => void): string {
    const offAllName = getOffAllName();

    return this._onTriggerOff(offAllName, callback);
  }

  public offTriggerOff(eventHash: string) {
    this._offTriggerOff(eventHash);
  }

  public emitSync<EventName extends keyof EventMap>(eventName: EventName, data: EventMap[EventName]): void;
  public emitSync<StateName extends keyof StateMap>(stateName: StateName, data: StateMap[StateName]): void;
  public emitSync(eventName: any, data?: any): void {
    const events = this.getEvents(eventName);
    events.map(event => event.callback(data, event.eventHash));
  }

  public async emitAsync<EventName extends keyof EventMap>(eventName: EventName, data: EventMap[EventName]): Promise<void>;
  public async emitAsync<StateName extends keyof StateMap>(stateName: StateName, data: StateMap[StateName]): Promise<void>;
  public async emitAsync(eventName: string, data?: any): Promise<void> {
    const events = this.getEvents(eventName);
    await Promise.all(events.map(async event => event.callback(data, event.eventHash)));
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

  public _onTriggerOff(eventName: string, callback: SubscribeType<any>): string {
    const eventHash = `trigger_off_${guid.guid()}`;
    this._offTriggers.push({ eventName, eventHash, callback });

    return eventHash;
  }

  public _offTriggerOff(eventHash: string): void {
    this._offTriggers = this._offTriggers.filter(m => m.eventHash !== eventHash);
  }

  private _offEmit(eventHash: string): void {
    const offEventName = getOffName(eventHash);
    const offEvents = this._offTriggers.filter(m => m.eventName === offEventName);

    offEvents.map(offEvent => offEvent.callback(null, offEvent.eventHash));
  }

  private _offAction(eventHash: string): void {
    this._events = this._events.filter(m => m.eventHash !== eventHash);
  }

  private _offEventEmit(eventName: any): void {
    const offEventName = getOffEventName(eventName);
    const offEvents = this._offTriggers.filter(m => m.eventName === offEventName);

    offEvents.map(offEvent => offEvent.callback(null, offEvent.eventHash));
  }

  private _offEventAction(eventName: any): void {
    this._events = this._events.filter(m => m.eventName !== eventName);
  }

  private _offAllEmit(): void {
    const offEventName = getOffAllName();
    const offEvents = this._offTriggers.filter(m => m.eventName === offEventName);

    offEvents.map(offEvent => offEvent.callback(null, offEvent.eventHash));
  }

  private _offAllAction(): void {
    this._events = [];
  }
}

function getOffName(eventHash: string) {
  return `trigger_off_${eventHash}`;
}

function getOffEventName(eventName: string) {
  return `trigger_off_event_${eventName}`;
}

function getOffAllName() {
  return `trigger_off_all`;
}
