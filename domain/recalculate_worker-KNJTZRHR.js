"use strict";
(() => {
  // node_modules/idb/build/index.js
  var instanceOfAny = (object, constructors) => constructors.some((c) => object instanceof c);
  var idbProxyableTypes;
  var cursorAdvanceMethods;
  function getIdbProxyableTypes() {
    return idbProxyableTypes || (idbProxyableTypes = [
      IDBDatabase,
      IDBObjectStore,
      IDBIndex,
      IDBCursor,
      IDBTransaction
    ]);
  }
  function getCursorAdvanceMethods() {
    return cursorAdvanceMethods || (cursorAdvanceMethods = [
      IDBCursor.prototype.advance,
      IDBCursor.prototype.continue,
      IDBCursor.prototype.continuePrimaryKey
    ]);
  }
  var transactionDoneMap = /* @__PURE__ */ new WeakMap();
  var transformCache = /* @__PURE__ */ new WeakMap();
  var reverseTransformCache = /* @__PURE__ */ new WeakMap();
  function promisifyRequest(request) {
    const promise = new Promise((resolve, reject) => {
      const unlisten = () => {
        request.removeEventListener("success", success);
        request.removeEventListener("error", error);
      };
      const success = () => {
        resolve(wrap(request.result));
        unlisten();
      };
      const error = () => {
        reject(request.error);
        unlisten();
      };
      request.addEventListener("success", success);
      request.addEventListener("error", error);
    });
    reverseTransformCache.set(promise, request);
    return promise;
  }
  function cacheDonePromiseForTransaction(tx) {
    if (transactionDoneMap.has(tx))
      return;
    const done = new Promise((resolve, reject) => {
      const unlisten = () => {
        tx.removeEventListener("complete", complete);
        tx.removeEventListener("error", error);
        tx.removeEventListener("abort", error);
      };
      const complete = () => {
        resolve();
        unlisten();
      };
      const error = () => {
        reject(tx.error || new DOMException("AbortError", "AbortError"));
        unlisten();
      };
      tx.addEventListener("complete", complete);
      tx.addEventListener("error", error);
      tx.addEventListener("abort", error);
    });
    transactionDoneMap.set(tx, done);
  }
  var idbProxyTraps = {
    get(target, prop, receiver) {
      if (target instanceof IDBTransaction) {
        if (prop === "done")
          return transactionDoneMap.get(target);
        if (prop === "store") {
          return receiver.objectStoreNames[1] ? void 0 : receiver.objectStore(receiver.objectStoreNames[0]);
        }
      }
      return wrap(target[prop]);
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
    has(target, prop) {
      if (target instanceof IDBTransaction && (prop === "done" || prop === "store")) {
        return true;
      }
      return prop in target;
    }
  };
  function replaceTraps(callback) {
    idbProxyTraps = callback(idbProxyTraps);
  }
  function wrapFunction(func) {
    if (getCursorAdvanceMethods().includes(func)) {
      return function(...args) {
        func.apply(unwrap(this), args);
        return wrap(this.request);
      };
    }
    return function(...args) {
      return wrap(func.apply(unwrap(this), args));
    };
  }
  function transformCachableValue(value) {
    if (typeof value === "function")
      return wrapFunction(value);
    if (value instanceof IDBTransaction)
      cacheDonePromiseForTransaction(value);
    if (instanceOfAny(value, getIdbProxyableTypes()))
      return new Proxy(value, idbProxyTraps);
    return value;
  }
  function wrap(value) {
    if (value instanceof IDBRequest)
      return promisifyRequest(value);
    if (transformCache.has(value))
      return transformCache.get(value);
    const newValue = transformCachableValue(value);
    if (newValue !== value) {
      transformCache.set(value, newValue);
      reverseTransformCache.set(newValue, value);
    }
    return newValue;
  }
  var unwrap = (value) => reverseTransformCache.get(value);
  function openDB(name, version, { blocked, upgrade, blocking, terminated } = {}) {
    const request = indexedDB.open(name, version);
    const openPromise = wrap(request);
    if (upgrade) {
      request.addEventListener("upgradeneeded", (event) => {
        upgrade(wrap(request.result), event.oldVersion, event.newVersion, wrap(request.transaction), event);
      });
    }
    if (blocked) {
      request.addEventListener("blocked", (event) => blocked(
        // Casting due to https://github.com/microsoft/TypeScript-DOM-lib-generator/pull/1405
        event.oldVersion,
        event.newVersion,
        event
      ));
    }
    openPromise.then((db) => {
      if (terminated)
        db.addEventListener("close", () => terminated());
      if (blocking) {
        db.addEventListener("versionchange", (event) => blocking(event.oldVersion, event.newVersion, event));
      }
    }).catch(() => {
    });
    return openPromise;
  }
  var readMethods = ["get", "getKey", "getAll", "getAllKeys", "count"];
  var writeMethods = ["put", "add", "delete", "clear"];
  var cachedMethods = /* @__PURE__ */ new Map();
  function getMethod(target, prop) {
    if (!(target instanceof IDBDatabase && !(prop in target) && typeof prop === "string")) {
      return;
    }
    if (cachedMethods.get(prop))
      return cachedMethods.get(prop);
    const targetFuncName = prop.replace(/FromIndex$/, "");
    const useIndex = prop !== targetFuncName;
    const isWrite = writeMethods.includes(targetFuncName);
    if (
      // Bail if the target doesn't exist on the target. Eg, getAll isn't in Edge.
      !(targetFuncName in (useIndex ? IDBIndex : IDBObjectStore).prototype) || !(isWrite || readMethods.includes(targetFuncName))
    ) {
      return;
    }
    const method = async function(storeName, ...args) {
      const tx = this.transaction(storeName, isWrite ? "readwrite" : "readonly");
      let target2 = tx.store;
      if (useIndex)
        target2 = target2.index(args.shift());
      return (await Promise.all([
        target2[targetFuncName](...args),
        isWrite && tx.done
      ]))[0];
    };
    cachedMethods.set(prop, method);
    return method;
  }
  replaceTraps((oldTraps) => ({
    ...oldTraps,
    get: (target, prop, receiver) => getMethod(target, prop) || oldTraps.get(target, prop, receiver),
    has: (target, prop) => !!getMethod(target, prop) || oldTraps.has(target, prop)
  }));
  var advanceMethodProps = ["continue", "continuePrimaryKey", "advance"];
  var methodMap = {};
  var advanceResults = /* @__PURE__ */ new WeakMap();
  var ittrProxiedCursorToOriginalProxy = /* @__PURE__ */ new WeakMap();
  var cursorIteratorTraps = {
    get(target, prop) {
      if (!advanceMethodProps.includes(prop))
        return target[prop];
      let cachedFunc = methodMap[prop];
      if (!cachedFunc) {
        cachedFunc = methodMap[prop] = function(...args) {
          advanceResults.set(this, ittrProxiedCursorToOriginalProxy.get(this)[prop](...args));
        };
      }
      return cachedFunc;
    }
  };
  async function* iterate(...args) {
    let cursor = this;
    if (!(cursor instanceof IDBCursor)) {
      cursor = await cursor.openCursor(...args);
    }
    if (!cursor)
      return;
    cursor = cursor;
    const proxiedCursor = new Proxy(cursor, cursorIteratorTraps);
    ittrProxiedCursorToOriginalProxy.set(proxiedCursor, cursor);
    reverseTransformCache.set(proxiedCursor, unwrap(cursor));
    while (cursor) {
      yield proxiedCursor;
      cursor = await (advanceResults.get(proxiedCursor) || cursor.continue());
      advanceResults.delete(proxiedCursor);
    }
  }
  function isIteratorProp(target, prop) {
    return prop === Symbol.asyncIterator && instanceOfAny(target, [IDBIndex, IDBObjectStore, IDBCursor]) || prop === "iterate" && instanceOfAny(target, [IDBIndex, IDBObjectStore]);
  }
  replaceTraps((oldTraps) => ({
    ...oldTraps,
    get(target, prop, receiver) {
      if (isIteratorProp(target, prop))
        return iterate;
      return oldTraps.get(target, prop, receiver);
    },
    has(target, prop) {
      return isIteratorProp(target, prop) || oldTraps.has(target, prop);
    }
  }));

  // web_src/infrastructure/db.ts
  var DB_VERSION = 3;

  // node_modules/big.js/big.mjs
  var DP = 20;
  var RM = 1;
  var MAX_DP = 1e6;
  var MAX_POWER = 1e6;
  var NE = -7;
  var PE = 21;
  var STRICT = false;
  var NAME = "[big.js] ";
  var INVALID = NAME + "Invalid ";
  var INVALID_DP = INVALID + "decimal places";
  var INVALID_RM = INVALID + "rounding mode";
  var DIV_BY_ZERO = NAME + "Division by zero";
  var P = {};
  var UNDEFINED = void 0;
  var NUMERIC = /^-?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i;
  function _Big_() {
    function Big2(n) {
      var x = this;
      if (!(x instanceof Big2)) {
        return n === UNDEFINED && arguments.length === 0 ? _Big_() : new Big2(n);
      }
      if (n instanceof Big2) {
        x.s = n.s;
        x.e = n.e;
        x.c = n.c.slice();
      } else {
        if (typeof n !== "string") {
          if (Big2.strict === true && typeof n !== "bigint") {
            throw TypeError(INVALID + "value");
          }
          n = n === 0 && 1 / n < 0 ? "-0" : String(n);
        }
        parse(x, n);
      }
      x.constructor = Big2;
    }
    Big2.prototype = P;
    Big2.DP = DP;
    Big2.RM = RM;
    Big2.NE = NE;
    Big2.PE = PE;
    Big2.strict = STRICT;
    Big2.roundDown = 0;
    Big2.roundHalfUp = 1;
    Big2.roundHalfEven = 2;
    Big2.roundUp = 3;
    return Big2;
  }
  function parse(x, n) {
    var e, i, nl;
    if (!NUMERIC.test(n)) {
      throw Error(INVALID + "number");
    }
    x.s = n.charAt(0) == "-" ? (n = n.slice(1), -1) : 1;
    if ((e = n.indexOf(".")) > -1) n = n.replace(".", "");
    if ((i = n.search(/e/i)) > 0) {
      if (e < 0) e = i;
      e += +n.slice(i + 1);
      n = n.substring(0, i);
    } else if (e < 0) {
      e = n.length;
    }
    nl = n.length;
    for (i = 0; i < nl && n.charAt(i) == "0"; ) ++i;
    if (i == nl) {
      x.c = [x.e = 0];
    } else {
      for (; nl > 0 && n.charAt(--nl) == "0"; ) ;
      x.e = e - i - 1;
      x.c = [];
      for (e = 0; i <= nl; ) x.c[e++] = +n.charAt(i++);
    }
    return x;
  }
  function round(x, sd, rm, more) {
    var xc = x.c;
    if (rm === UNDEFINED) rm = x.constructor.RM;
    if (rm !== 0 && rm !== 1 && rm !== 2 && rm !== 3) {
      throw Error(INVALID_RM);
    }
    if (sd < 1) {
      more = rm === 3 && (more || !!xc[0]) || sd === 0 && (rm === 1 && xc[0] >= 5 || rm === 2 && (xc[0] > 5 || xc[0] === 5 && (more || xc[1] !== UNDEFINED)));
      xc.length = 1;
      if (more) {
        x.e = x.e - sd + 1;
        xc[0] = 1;
      } else {
        xc[0] = x.e = 0;
      }
    } else if (sd < xc.length) {
      more = rm === 1 && xc[sd] >= 5 || rm === 2 && (xc[sd] > 5 || xc[sd] === 5 && (more || xc[sd + 1] !== UNDEFINED || xc[sd - 1] & 1)) || rm === 3 && (more || !!xc[0]);
      xc.length = sd;
      if (more) {
        for (; ++xc[--sd] > 9; ) {
          xc[sd] = 0;
          if (sd === 0) {
            ++x.e;
            xc.unshift(1);
            break;
          }
        }
      }
      for (sd = xc.length; !xc[--sd]; ) xc.pop();
    }
    return x;
  }
  function stringify(x, doExponential, isNonzero) {
    var e = x.e, s = x.c.join(""), n = s.length;
    if (doExponential) {
      s = s.charAt(0) + (n > 1 ? "." + s.slice(1) : "") + (e < 0 ? "e" : "e+") + e;
    } else if (e < 0) {
      for (; ++e; ) s = "0" + s;
      s = "0." + s;
    } else if (e > 0) {
      if (++e > n) {
        for (e -= n; e--; ) s += "0";
      } else if (e < n) {
        s = s.slice(0, e) + "." + s.slice(e);
      }
    } else if (n > 1) {
      s = s.charAt(0) + "." + s.slice(1);
    }
    return x.s < 0 && isNonzero ? "-" + s : s;
  }
  P.abs = function() {
    var x = new this.constructor(this);
    x.s = 1;
    return x;
  };
  P.cmp = function(y) {
    var isneg, x = this, xc = x.c, yc = (y = new x.constructor(y)).c, i = x.s, j = y.s, k = x.e, l = y.e;
    if (!xc[0] || !yc[0]) return !xc[0] ? !yc[0] ? 0 : -j : i;
    if (i != j) return i;
    isneg = i < 0;
    if (k != l) return k > l ^ isneg ? 1 : -1;
    j = (k = xc.length) < (l = yc.length) ? k : l;
    for (i = -1; ++i < j; ) {
      if (xc[i] != yc[i]) return xc[i] > yc[i] ^ isneg ? 1 : -1;
    }
    return k == l ? 0 : k > l ^ isneg ? 1 : -1;
  };
  P.div = function(y) {
    var x = this, Big2 = x.constructor, a = x.c, b = (y = new Big2(y)).c, k = x.s == y.s ? 1 : -1, dp = Big2.DP;
    if (dp !== ~~dp || dp < 0 || dp > MAX_DP) {
      throw Error(INVALID_DP);
    }
    if (!b[0]) {
      throw Error(DIV_BY_ZERO);
    }
    if (!a[0]) {
      y.s = k;
      y.c = [y.e = 0];
      return y;
    }
    var bl, bt, n, cmp, ri, bz = b.slice(), ai = bl = b.length, al = a.length, r = a.slice(0, bl), rl = r.length, q = y, qc = q.c = [], qi = 0, p = dp + (q.e = x.e - y.e) + 1;
    q.s = k;
    k = p < 0 ? 0 : p;
    bz.unshift(0);
    for (; rl++ < bl; ) r.push(0);
    do {
      for (n = 0; n < 10; n++) {
        if (bl != (rl = r.length)) {
          cmp = bl > rl ? 1 : -1;
        } else {
          for (ri = -1, cmp = 0; ++ri < bl; ) {
            if (b[ri] != r[ri]) {
              cmp = b[ri] > r[ri] ? 1 : -1;
              break;
            }
          }
        }
        if (cmp < 0) {
          for (bt = rl == bl ? b : bz; rl; ) {
            if (r[--rl] < bt[rl]) {
              ri = rl;
              for (; ri && !r[--ri]; ) r[ri] = 9;
              --r[ri];
              r[rl] += 10;
            }
            r[rl] -= bt[rl];
          }
          for (; !r[0]; ) r.shift();
        } else {
          break;
        }
      }
      qc[qi++] = cmp ? n : ++n;
      if (r[0] && cmp) r[rl] = a[ai] || 0;
      else r = [a[ai]];
    } while ((ai++ < al || r[0] !== UNDEFINED) && k--);
    if (!qc[0] && qi != 1) {
      qc.shift();
      q.e--;
      p--;
    }
    if (qi > p) round(q, p, Big2.RM, r[0] !== UNDEFINED);
    return q;
  };
  P.eq = function(y) {
    return this.cmp(y) === 0;
  };
  P.gt = function(y) {
    return this.cmp(y) > 0;
  };
  P.gte = function(y) {
    return this.cmp(y) > -1;
  };
  P.lt = function(y) {
    return this.cmp(y) < 0;
  };
  P.lte = function(y) {
    return this.cmp(y) < 1;
  };
  P.minus = P.sub = function(y) {
    var i, j, t, xlty, x = this, Big2 = x.constructor, a = x.s, b = (y = new Big2(y)).s;
    if (a != b) {
      y.s = -b;
      return x.plus(y);
    }
    var xc = x.c.slice(), xe = x.e, yc = y.c, ye = y.e;
    if (!xc[0] || !yc[0]) {
      if (yc[0]) {
        y.s = -b;
      } else if (xc[0]) {
        y = new Big2(x);
      } else {
        y.s = 1;
      }
      return y;
    }
    if (a = xe - ye) {
      if (xlty = a < 0) {
        a = -a;
        t = xc;
      } else {
        ye = xe;
        t = yc;
      }
      t.reverse();
      for (b = a; b--; ) t.push(0);
      t.reverse();
    } else {
      j = ((xlty = xc.length < yc.length) ? xc : yc).length;
      for (a = b = 0; b < j; b++) {
        if (xc[b] != yc[b]) {
          xlty = xc[b] < yc[b];
          break;
        }
      }
    }
    if (xlty) {
      t = xc;
      xc = yc;
      yc = t;
      y.s = -y.s;
    }
    if ((b = (j = yc.length) - (i = xc.length)) > 0) for (; b--; ) xc[i++] = 0;
    for (b = i; j > a; ) {
      if (xc[--j] < yc[j]) {
        for (i = j; i && !xc[--i]; ) xc[i] = 9;
        --xc[i];
        xc[j] += 10;
      }
      xc[j] -= yc[j];
    }
    for (; xc[--b] === 0; ) xc.pop();
    for (; xc[0] === 0; ) {
      xc.shift();
      --ye;
    }
    if (!xc[0]) {
      y.s = 1;
      xc = [ye = 0];
    }
    y.c = xc;
    y.e = ye;
    return y;
  };
  P.mod = function(y) {
    var ygtx, x = this, Big2 = x.constructor, a = x.s, b = (y = new Big2(y)).s;
    if (!y.c[0]) {
      throw Error(DIV_BY_ZERO);
    }
    x.s = y.s = 1;
    ygtx = y.cmp(x) == 1;
    x.s = a;
    y.s = b;
    if (ygtx) return new Big2(x);
    a = Big2.DP;
    b = Big2.RM;
    Big2.DP = Big2.RM = 0;
    x = x.div(y);
    Big2.DP = a;
    Big2.RM = b;
    return this.minus(x.times(y));
  };
  P.neg = function() {
    var x = new this.constructor(this);
    x.s = -x.s;
    return x;
  };
  P.plus = P.add = function(y) {
    var e, k, t, x = this, Big2 = x.constructor;
    y = new Big2(y);
    if (x.s != y.s) {
      y.s = -y.s;
      return x.minus(y);
    }
    var xe = x.e, xc = x.c, ye = y.e, yc = y.c;
    if (!xc[0] || !yc[0]) {
      if (!yc[0]) {
        if (xc[0]) {
          y = new Big2(x);
        } else {
          y.s = x.s;
        }
      }
      return y;
    }
    xc = xc.slice();
    if (e = xe - ye) {
      if (e > 0) {
        ye = xe;
        t = yc;
      } else {
        e = -e;
        t = xc;
      }
      t.reverse();
      for (; e--; ) t.push(0);
      t.reverse();
    }
    if (xc.length - yc.length < 0) {
      t = yc;
      yc = xc;
      xc = t;
    }
    e = yc.length;
    for (k = 0; e; xc[e] %= 10) k = (xc[--e] = xc[e] + yc[e] + k) / 10 | 0;
    if (k) {
      xc.unshift(k);
      ++ye;
    }
    for (e = xc.length; xc[--e] === 0; ) xc.pop();
    y.c = xc;
    y.e = ye;
    return y;
  };
  P.pow = function(n) {
    var x = this, one = new x.constructor("1"), y = one, isneg = n < 0;
    if (n !== ~~n || n < -MAX_POWER || n > MAX_POWER) {
      throw Error(INVALID + "exponent");
    }
    if (isneg) n = -n;
    for (; ; ) {
      if (n & 1) y = y.times(x);
      n >>= 1;
      if (!n) break;
      x = x.times(x);
    }
    return isneg ? one.div(y) : y;
  };
  P.prec = function(sd, rm) {
    if (sd !== ~~sd || sd < 1 || sd > MAX_DP) {
      throw Error(INVALID + "precision");
    }
    return round(new this.constructor(this), sd, rm);
  };
  P.round = function(dp, rm) {
    if (dp === UNDEFINED) dp = 0;
    else if (dp !== ~~dp || dp < -MAX_DP || dp > MAX_DP) {
      throw Error(INVALID_DP);
    }
    return round(new this.constructor(this), dp + this.e + 1, rm);
  };
  P.sqrt = function() {
    var r, c, t, x = this, Big2 = x.constructor, s = x.s, e = x.e, half = new Big2("0.5");
    if (!x.c[0]) return new Big2(x);
    if (s < 0) {
      throw Error(NAME + "No square root");
    }
    s = Math.sqrt(+stringify(x, true, true));
    if (s === 0 || s === 1 / 0) {
      c = x.c.join("");
      if (!(c.length + e & 1)) c += "0";
      s = Math.sqrt(c);
      e = ((e + 1) / 2 | 0) - (e < 0 || e & 1);
      r = new Big2((s == 1 / 0 ? "5e" : (s = s.toExponential()).slice(0, s.indexOf("e") + 1)) + e);
    } else {
      r = new Big2(s + "");
    }
    e = r.e + (Big2.DP += 4);
    do {
      t = r;
      r = half.times(t.plus(x.div(t)));
    } while (t.c.slice(0, e).join("") !== r.c.slice(0, e).join(""));
    return round(r, (Big2.DP -= 4) + r.e + 1, Big2.RM);
  };
  P.times = P.mul = function(y) {
    var c, x = this, Big2 = x.constructor, xc = x.c, yc = (y = new Big2(y)).c, a = xc.length, b = yc.length, i = x.e, j = y.e;
    y.s = x.s == y.s ? 1 : -1;
    if (!xc[0] || !yc[0]) {
      y.c = [y.e = 0];
      return y;
    }
    y.e = i + j;
    if (a < b) {
      c = xc;
      xc = yc;
      yc = c;
      j = a;
      a = b;
      b = j;
    }
    for (c = new Array(j = a + b); j--; ) c[j] = 0;
    for (i = b; i--; ) {
      b = 0;
      for (j = a + i; j > i; ) {
        b = c[j] + yc[i] * xc[j - i - 1] + b;
        c[j--] = b % 10;
        b = b / 10 | 0;
      }
      c[j] = b;
    }
    if (b) ++y.e;
    else c.shift();
    for (i = c.length; !c[--i]; ) c.pop();
    y.c = c;
    return y;
  };
  P.toExponential = function(dp, rm) {
    var x = this, n = x.c[0];
    if (dp !== UNDEFINED) {
      if (dp !== ~~dp || dp < 0 || dp > MAX_DP) {
        throw Error(INVALID_DP);
      }
      x = round(new x.constructor(x), ++dp, rm);
      for (; x.c.length < dp; ) x.c.push(0);
    }
    return stringify(x, true, !!n);
  };
  P.toFixed = function(dp, rm) {
    var x = this, n = x.c[0];
    if (dp !== UNDEFINED) {
      if (dp !== ~~dp || dp < 0 || dp > MAX_DP) {
        throw Error(INVALID_DP);
      }
      x = round(new x.constructor(x), dp + x.e + 1, rm);
      for (dp = dp + x.e + 1; x.c.length < dp; ) x.c.push(0);
    }
    return stringify(x, false, !!n);
  };
  P.toJSON = P.toString = function() {
    var x = this, Big2 = x.constructor;
    return stringify(x, x.e <= Big2.NE || x.e >= Big2.PE, !!x.c[0]);
  };
  if (typeof Symbol !== "undefined") {
    P[/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")] = P.toJSON;
  }
  P.toNumber = function() {
    var n = +stringify(this, true, true);
    if (this.constructor.strict === true && !this.eq(n.toString())) {
      throw Error(NAME + "Imprecise conversion");
    }
    return n;
  };
  P.toPrecision = function(sd, rm) {
    var x = this, Big2 = x.constructor, n = x.c[0];
    if (sd !== UNDEFINED) {
      if (sd !== ~~sd || sd < 1 || sd > MAX_DP) {
        throw Error(INVALID + "precision");
      }
      x = round(new Big2(x), sd, rm);
      for (; x.c.length < sd; ) x.c.push(0);
    }
    return stringify(x, sd <= x.e || x.e <= Big2.NE || x.e >= Big2.PE, !!n);
  };
  P.valueOf = function() {
    var x = this, Big2 = x.constructor;
    if (Big2.strict === true) {
      throw Error(NAME + "valueOf disallowed");
    }
    return stringify(x, x.e <= Big2.NE || x.e >= Big2.PE, true);
  };
  var Big = _Big_();
  var big_default = Big;

  // web_src/domain/recalculate_worker.ts
  function addStrings(a, b) {
    try {
      const bigA = new big_default(a || "0");
      const bigB = new big_default(b || "0");
      return bigA.plus(bigB).toString();
    } catch {
      return a;
    }
  }
  function subStrings(a, b) {
    try {
      const bigA = new big_default(a || "0");
      const bigB = new big_default(b || "0");
      return bigA.minus(bigB).toString();
    } catch {
      return a;
    }
  }
  self.onmessage = async (e) => {
    if (e.data === "recalculate") {
      try {
        const db = await openDB("money-management-app", DB_VERSION);
        const [transactions, accounts] = await Promise.all([
          db.getAllFromIndex("transactions", "by-date"),
          db.getAll("accounts")
        ]);
        transactions.sort((a, b) => {
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          return a.id - b.id;
        });
        const balancesByName = {};
        for (const acc of accounts) {
          balancesByName[acc.name] = "0";
        }
        for (const tx of transactions) {
          const amount = tx.amountAccountCurrency || "0";
          if (tx.accountName && balancesByName[tx.accountName] === void 0) {
            balancesByName[tx.accountName] = "0";
          }
          if (tx.type === "deposit") {
            balancesByName[tx.accountName] = addStrings(balancesByName[tx.accountName], amount);
          } else if (tx.type === "withdraw") {
            balancesByName[tx.accountName] = subStrings(balancesByName[tx.accountName], amount);
          } else if (tx.type === "transfer") {
            balancesByName[tx.accountName] = subStrings(balancesByName[tx.accountName], amount);
            if (tx.transferReceiveAccountName) {
              if (balancesByName[tx.transferReceiveAccountName] === void 0) {
                balancesByName[tx.transferReceiveAccountName] = "0";
              }
              const receiveAmount = tx.transferReceiveAmountAccountCurrency || "0";
              balancesByName[tx.transferReceiveAccountName] = addStrings(balancesByName[tx.transferReceiveAccountName], receiveAmount);
            }
          } else if (tx.type === "balance_correct") {
            balancesByName[tx.accountName] = amount;
          }
        }
        const txStore = db.transaction("accounts", "readwrite");
        for (const acc of accounts) {
          if (acc.balance !== balancesByName[acc.name]) {
            acc.balance = balancesByName[acc.name];
            txStore.store.put(acc);
          }
        }
        await txStore.done;
        self.postMessage({ status: "done" });
      } catch (error) {
        self.postMessage({ status: "error", error: error instanceof Error ? error.message : String(error) });
      }
    }
  };
})();
//# sourceMappingURL=recalculate_worker-KNJTZRHR.js.map
