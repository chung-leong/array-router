import { expect } from 'chai';
import { createElement, useState, Fragment, Suspense, lazy } from 'react';
import { withTestRenderer } from './test-renderer.js';
import { withJSDOM } from './jsdom.js';
import { withReactDOM } from './dom-renderer.js';
import { withSilentConsole } from './error-handling.js';
import parse from 'shell-quote/parse.js';
import quote from 'shell-quote/quote.js';
import meowrev, { meowparse } from 'meow-reverse';

import {
  useRouter,
  useRoute,
  useLocation,
  useSequentialRouter,
  RouteChangePending,
  setCoercionMethod,
} from '../index.js';

describe('#useRouter()', function() {
  it('should return a function', async function() {
    await withTestRenderer(async ({ render, toJSON }) => {
      let f;
      function Test() {
        const provide = useRouter({ location: 'http://example.test/hello/world/?a=1&b=123' });
        f = provide;
        return 'TEST';
      }
      const el = createElement(Test);
      await render(el);
      expect(toJSON()).to.equal('TEST');
      expect(f).to.be.a('function');
    });
  })
  it('should throw when basePath is not in location', async function() {
    await withTestRenderer(async ({ render, toJSON }) => {
      let error;
      function Test() {
        try {
          const provide = useRouter({
            basePath: '/hallo/',
            location: 'http://example.test/hello/world/?a=1&b=123'
          });
        } catch (err) {
          error = err;
        }
        return 'TEST';
      }
      const el = createElement(Test);
      await render(el);
      expect(error).to.be.an('error');
    });
  })
  it('should throw when basePath does not end with a trailing slash', async function() {
    await withTestRenderer(async ({ render, toJSON }) => {
      let error;
      function Test() {
        try {
          const provide = useRouter({
            basePath: '/hello',
            location: 'http://example.test/hello/world/?a=1&b=123'
          });
        } catch (err) {
          error = err;
        }
        return 'TEST';
      }
      const el = createElement(Test);
      await render(el);
      expect(error).to.be.an('error');
    });
  })
  it('should correctly parse the path and query', async function() {
    await withTestRenderer(async ({ render, toJSON }) => {
      let p, q;
      function Test({ location }) {
        const provide = useRouter({ location });
        return provide((parts, query) => {
          p = parts;
          q = query;
          return `TEST ${parts.length}`;
        });
      }
      const el = createElement(Test, { location: 'http://example.test/hello/world/?a=1&b=123' });
      await render(el);
      expect(toJSON()).to.equal('TEST 2');
      expect(p).to.eql([ 'hello', 'world' ]);
      expect(q).to.eql({ a: '1', b: '123' });
      expect(Object.keys(p)).to.eql([ '0', '1' ]);
      expect(Object.keys(q)).to.eql([ 'a', 'b' ]);
    });
  })
  it('should use globalThis.location when location is not given', async function() {
    await withTestRenderer(async ({ render, toJSON }) => {
      globalThis.location = 'http://example.test/hello/world/?a=1&b=123';
      try {
        let p, q;
        function Test() {
          const provide = useRouter();
          return provide((parts, query) => {
            p = parts;
            q = query;
            return `TEST ${parts.length}`;
          });
        }
        const el = createElement(Test);
        await render(el);
        expect(toJSON()).to.equal('TEST 2');
        expect(p).to.eql([ 'hello', 'world' ]);
        expect(q).to.eql({ a: '1', b: '123' });
        expect(Object.keys(p)).to.eql([ '0', '1' ]);
        expect(Object.keys(q)).to.eql([ 'a', 'b' ]);
      } finally {
        delete globalThis.location;
      }
    });
  })
  it('should rerender when a change is made to the path', async function() {
    await withTestRenderer(async ({ render, toJSON, act }) => {
      let p, q, count = 0;
      function Test({ location }) {
        const provide = useRouter({ location });
        count++;
        return provide((parts, query) => {
          p = parts;
          q = query;
          return `${p[0]} ${p[1]} ${q.b}`;
        });
      }
      const el = createElement(Test, { location: 'http://example.test/hello/world/?a=1&b=123' });
      await render(el);
      expect(toJSON()).to.equal('hello world 123');
      expect(count).to.equal(1);
      await act(() => p[0] = 'die');
      expect(toJSON()).to.equal('die world 123');
      expect(count).to.equal(2);
      await act(() => q.b = 43);
      expect(toJSON()).to.equal('die world 43');
      expect(count).to.equal(3);
    });
  })
  it('should not rerender when change made is not relevant at the root level', async function() {
    await withTestRenderer(async ({ render, toJSON, act }) => {
      let p, q, count = 0;
      function Test({ location }) {
        const provide = useRouter({ location });
        count++;
        return provide((parts, query) => {
          p = parts;
          q = query;
          return `${p[0]} ${q.b}`;
        });
      }
      const el = createElement(Test, { location: 'http://example.test/hello/world/?a=1&b=123' });
      await render(el);
      expect(toJSON()).to.equal('hello 123');
      expect(count).to.equal(1);
      await act(() => p[1] = 'universe');
      expect(toJSON()).to.equal('hello 123');
      expect(count).to.equal(1);
      await act(() => q.b = 43);
      expect(toJSON()).to.equal('hello 43');
      expect(count).to.equal(2);
      await act(() => q.a = 2);
      expect(count).to.equal(2);
    });
  })
  it('should not rerender when slice returns the same items', async function() {
    await withTestRenderer(async ({ render, toJSON, act }) => {
      let p, q, count = 0;
      function Test({ location }) {
        const provide = useRouter({ location });
        count++;
        return provide((parts, query) => {
          p = parts;
          q = query;
          return `${p.slice(0, 1)}`;
        });
      }
      const el = createElement(Test, { location: 'http://example.test/hello/world/?a=1&b=123' });
      await render(el);
      expect(toJSON()).to.equal('hello');
      expect(count).to.equal(1);
      await act(() => p[1] = 'universe');
      expect(count).to.equal(1);
    });
  })
  it('should render when slice returns additional items', async function() {
    await withTestRenderer(async ({ render, toJSON, act }) => {
      let p, q, count = 0;
      function Test({ location }) {
        const provide = useRouter({ location });
        count++;
        return provide((parts, query) => {
          p = parts;
          q = query;
          return `${p.slice(0)}`;
        });
      }
      const el = createElement(Test, { location: 'http://example.test/hello/world/?a=1&b=123' });
      await render(el);
      expect(toJSON()).to.equal('hello,world');
      expect(count).to.equal(1);
      await act(() => p.push('hello'));
      expect(toJSON()).to.equal('hello,world,hello');
      expect(count).to.equal(2);
    });
  })
  it('should render when slice returns different items', async function() {
    await withTestRenderer(async ({ render, toJSON, act }) => {
      let p, q, count = 0;
      function Test({ location }) {
        const provide = useRouter({ location });
        count++;
        return provide((parts, query) => {
          p = parts;
          q = query;
          return `${p.slice(0)}`;
        });
      }
      const el = createElement(Test, { location: 'http://example.test/hello/world/?a=1&b=123' });
      await render(el);
      expect(toJSON()).to.equal('hello,world');
      expect(count).to.equal(1);
      await act(() => p.splice(1, 1, 'universe'));
      expect(toJSON()).to.equal('hello,universe');
      expect(count).to.equal(2);
    });
  })
  it('should be able to trap and correct a 404 error', async function() {
    await withTestRenderer(async ({ render, toJSON, act }) => {
      let called = false;
      function Root({ location }) {
        const provide = useRouter({ location });
        return provide((parts, query, { trap }) => {
          trap('error', (err) => {
            called = true;
            return err.redirect([ 'hello', 'universe' ]);
          });
          return createElement(Comp);
        });
      }
      function Comp() {
        const [ parts, query, { throw404 } ] = useRoute();
        if (parts[1] === 'world') {
          throw404();
        }
        return `${parts[0]} ${parts[1]}`;
      }
      await withSilentConsole(async () => {
        const el = createElement(Root, { location: 'http://example.test/hello/world/?a=1&b=123' });
        await render(el);
        expect(toJSON()).to.equal('hello universe');
        expect(called).to.be.true;
      });
    });
  })
  it('should be allow 404 error to fall through when no trap catches it', async function() {
    await withTestRenderer(async ({ render, toJSON, act }) => {
      function Root({ location }) {
        const provide = useRouter({ location });
        return provide((parts, query, { trap, rethrow }) => {
          trap('error', (err) => {});
          try {
            rethrow();
            return createElement(Comp);
          } catch (err) {
            return 'Dingo ate my baby';
          };
        });
      }
      function Comp() {
        const [ parts, query, { throw404 } ] = useRoute();
        if (parts[1] === 'world') {
          throw404();
        }
        return `${parts[0]} ${parts[1]}`;
      }
      await withSilentConsole(async () => {
        const el = createElement(Root, { location: 'http://example.test/hello/world/?a=1&b=123' });
        await render(el);
        expect(toJSON()).to.equal('Dingo ate my baby');
      });
    });
  })
  it('should be able to trap and correct a non-404 error', async function() {
    await withTestRenderer(async ({ render, toJSON, act }) => {
      let error, called = false, throwing = true;
      function Root({ location }) {
        const provide = useRouter({ location });
        return provide((parts, query, { trap }) => {
          trap('error', (err) => {
            called = true;
            throwing = false;
            error = err;
            return true;
          });
          return createElement(Comp);
        });
      }
      function Comp() {
        if (throwing) {
          throw new Error('Life sucks');
        }
        return `Hello world`;
      }
      await withSilentConsole(async () => {
        const el = createElement(Root, { location: 'http://example.test/' });
        await render(el);
        expect(toJSON()).to.equal('Hello world');
        expect(called).to.be.true;
        expect(throwing).to.be.false;
        expect(error).to.be.an('error').with.property('message', 'Life sucks');
      });
    });
  })
  it('should throw when trap type is unknown', async function() {
    await withTestRenderer(async ({ render, toJSON, act }) => {
      let error;
      function Root({ location }) {
        const provide = useRouter({ location });
        return provide((parts, query, { trap }) => {
          try {
            trap('bobo', () => {});
          } catch (err) {
            error = err;
          }
          return createElement(Comp);
        });
      }
      function Comp() {
        return `Hello world`;
      }
      await withSilentConsole(async () => {
        const el = createElement(Root, { location: 'http://example.test/' });
        await render(el);
        expect(toJSON()).to.equal('Hello world');
        expect(error).to.be.an('error').with.property('message').that.contains('Unknown trap type');
      });
    });
  })
  it('should intercept clicks on hyperlinks', async function() {
    await withJSDOM('http://example.test/hello/world/?a=1&b=123', async function() {
      await withReactDOM(async ({ render, node, act }) => {
        function Test() {
          const provide = useRouter({ basePath: '/hello/' });
          return provide((parts, query) => {
            return createElement('a', { id: 'link', href: 'http://example.test/hello/hell/?a=1&b=123' }, parts[0]);
          });
        }
        const el = createElement(Test);
        await render(el);
        expect(node.textContent).to.equal('world');
        const link = document.getElementById('link');
        await act(() => link.click());
        expect(node.textContent).to.equal('hell');
        // note the lack of trailing backslash
        expect(location.href).to.equal('http://example.test/hello/hell?a=1&b=123');
      });
    })
  })
  it('should handle forward and backward buttons', async function() {
    await withJSDOM('http://example.test/hello/world/?a=1&b=123', async function() {
      await withReactDOM(async ({ render, node, act }) => {
        function Test() {
          const provide = useRouter({ basePath: '/hello/' });
          return provide((parts, query) => {
            return createElement('a', { id: 'link', href: 'http://example.test/hello/hell/?a=1&b=123' }, parts[0]);
          });
        }
        const el = createElement(Test);
        await render(el);
        expect(node.textContent).to.equal('world');
        const link = document.getElementById('link');
        await act(() => link.click());
        expect(node.textContent).to.equal('hell');
        await act(() => window.history.back() ?? delay(10));
        expect(node.textContent).to.equal('world');
      });
    })
  })
  it('should push state onto history stack', async function() {
    await withJSDOM('http://example.test/hello/world/?a=1&b=123', async function() {
      await withReactDOM(async ({ render, node, act }) => {
        let p, q;
        function Test() {
          const provide = useRouter({ basePath: '/hello/' });
          return provide((parts, query) => {
            p = parts;
            q = query;
            return parts[0];
          });
        }
        const el = createElement(Test);
        await render(el);
        const start = history.length;
        expect(node.textContent).to.equal('world');
        await act(() => {
          p[0] = 'hell';
          // URL changes occurs on the next tick
          return nextTick();
        });
        expect(node.textContent).to.equal('hell');
        expect(history.length).to.equal(start + 1);
      });
    });
  })
  it('should replace location by default when changing query variables', async function() {
    await withJSDOM('http://example.test/hello/?a=1&b=123', async function() {
      await withReactDOM(async ({ render, node, act }) => {
        let p, q;
        function Test() {
          const provide = useRouter({ basePath: '/hello/' });
          return provide((parts, query) => {
            p = parts;
            q = query;
            return `${query.a} ${query.b}`;
          });
        }
        const el = createElement(Test);
        await render(el);
        const start = history.length;
        expect(node.textContent).to.equal('1 123');
        await act(() => {
          q.b = 1234;
          q.a = 7;
          return nextTick();
        });
        expect(node.textContent).to.equal('7 1234');
        expect(history.length).to.equal(start);
      });
    });
  })
  it('should do push when pushing is used', async function() {
    await withJSDOM('http://example.test/hello/?a=1&b=123', async function() {
      await withReactDOM(async ({ render, node, act }) => {
        let p, q, m;
        function Test() {
          const provide = useRouter({ basePath: '/hello/' });
          return provide((parts, query, methods) => {
            p = parts;
            q = query;
            m = methods;
            return `${query.a} ${query.b}`;
          });
        }
        const el = createElement(Test);
        await render(el);
        const start = history.length;
        expect(node.textContent).to.equal('1 123');
        await act(() => {
          m.pushing(() => {
            q.b = 1234;
            q.a = 7;
          });
          return nextTick();
        });
        expect(node.textContent).to.equal('7 1234');
        expect(history.length).to.equal(start + 1);
      });
    });
  })
  it('should do replace when replacing is used', async function() {
    await withJSDOM('http://example.test/hello/world/?a=1&b=123', async function() {
      await withReactDOM(async ({ render, node, act }) => {
        let p, q, m;
        function Test() {
          const provide = useRouter({ basePath: '/hello/' });
          return provide((parts, query, methods) => {
            p = parts;
            q = query;
            m = methods;
            return parts[0];
          });
        }
        const el = createElement(Test);
        await render(el);
        const start = history.length;
        expect(node.textContent).to.equal('world');
        await act(() => {
          m.replacing(() => {
            p[0] = 'hell';
          });
          return nextTick();
        });
        expect(node.textContent).to.equal('hell');
        expect(history.length).to.equal(start);
      });
    });
  })
  it('should push when changing both query and path', async function() {
    await withJSDOM('http://example.test/hello/world/?a=1&b=123', async function() {
      await withReactDOM(async ({ render, node, act }) => {
        let p, q, m;
        function Test() {
          const provide = useRouter({ basePath: '/hello/' });
          return provide((parts, query) => {
            p = parts;
            q = query;
            return `${parts[0]} ${query.a}`;
          });
        }
        const el = createElement(Test);
        await render(el);
        const start = history.length;
        expect(node.textContent).to.equal('world 1');
        await act(() => {
          p[0] = 'hell';
          q.a = 18;
          return nextTick();
        });
        expect(node.textContent).to.equal('hell 18');
        expect(history.length).to.equal(start + 1);
      });
    });
  })
  it('should not use transition when the router itself is suspended', async function() {
    await withJSDOM('http://example.test/hello', async () => {
      await withReactDOM(async ({ render, toJSON, act, node }) => {
        const Lazy = lazy(async () => new Promise(() => {}));
        let d;
        function Test() {
          const provide = useRouter();
          return createElement(Suspense, { fallback: 'Donut' }, provide((parts, query, { detour }) => {
            d = detour;
            switch (parts[0]) {
              case 'hello':
                return createElement(Lazy);
              default:
                return 'Something';
            }
          }));
        }
        const el = createElement(Test);
        render(el);
        await act(() => d([ 'dingo' ]));
        expect(node.textContent).to.equal('Something');
      });
    });
  })
})

describe('#useRoute()', function() {
  it('should throw when context is missing', async function() {
    await withTestRenderer(async ({ render, toJSON }) => {
      let error;
      function Test() {
        try {
          useRoute();
        } catch (err) {
          error = err;
        }
        return 'Test';
      }
      const el = createElement(Test);
      await render(el);
      expect(error).to.be.an('error').with.property('message', 'No router context');
    });
  })
  it('should receive route from parent component', async function() {
    await withTestRenderer(async ({ render, toJSON, act }) => {
      function Root({ location }) {
        const provide = useRouter({ location });
        return provide((parts, query) => {
          const compA = createElement(CompA, { key: 'a' });
          const compB = createElement(CompB, { key: 'b' });
          return createElement(Fragment, {}, [ `${parts[0]}`, ' ', compA, ' ', compB ]);
        });
      }
      function CompA() {
        const [ parts, { a } ] = useRoute();
        return `${parts[1]} ${a}`;
      }
      function CompB() {
        const [ parts, { b } ] = useRoute();
        return `${parts[1]} ${b}`;
      }
      const el = createElement(Root, { location: 'http://example.test/hello/world/?a=1&b=123' });
      await render(el);
      expect(toJSON()).to.eql([ 'hello', ' ', 'world 1', ' ', 'world 123' ]);
    });
  })
  it('should update the components when route changes', async function() {
    await withTestRenderer(async ({ render, toJSON, act }) => {
      let p, q, rootCount = 0;
      function Root({ location }) {
        const provide = useRouter({ location });
        rootCount++;
        return provide((parts, query) => {
          p = parts;
          q = query;
          const compA = createElement(CompA, { key: 'a' });
          const compB = createElement(CompB, { key: 'b' });
          return createElement(Fragment, {}, [ `${parts[0]}`, ' ', compA, ' ', compB ]);
        });
      }
      let compACount = 0;
      function CompA() {
        const [ parts, { a } ] = useRoute();
        compACount++;
        return `${parts[1]} ${a}`;
      }
      let compBCount = 0;
      function CompB() {
        const [ parts, { b } ] = useRoute();
        compBCount++;
        return `${parts[1]} ${b}`;
      }
      const el = createElement(Root, { location: 'http://example.test/hello/world/?a=1&b=123' });
      await render(el);
      expect(toJSON()).to.eql([ 'hello', ' ', 'world 1', ' ', 'world 123' ]);
      expect(rootCount).to.equal(1);
      expect(compACount).to.equal(1);
      expect(compBCount).to.equal(1);
      await act(() => p[1] = 'universe');
      expect(toJSON()).to.eql([ 'hello', ' ', 'universe 1', ' ', 'universe 123' ]);
      expect(rootCount).to.equal(1);
      expect(compACount).to.equal(2);
      expect(compBCount).to.equal(2);
      await act(() => p[0] = 'die');
      expect(toJSON()).to.eql([ 'die', ' ', 'universe 1', ' ', 'universe 123' ]);
      expect(rootCount).to.equal(2);
      expect(compACount).to.equal(3);
      expect(compBCount).to.equal(3);
      await act(() => q.a = 43);
      expect(toJSON()).to.eql([ 'die', ' ', 'universe 43', ' ', 'universe 123' ]);
      expect(rootCount).to.equal(2);
      expect(compACount).to.equal(4);
      expect(compBCount).to.equal(3);
      await act(() => q.b = 43);
      expect(toJSON()).to.eql([ 'die', ' ', 'universe 43', ' ', 'universe 43' ]);
      expect(rootCount).to.equal(2);
      expect(compACount).to.equal(4);
      expect(compBCount).to.equal(4);
    });
  })
  it('should cancel updating when path gets changed back to what it was before', async function() {
    await withTestRenderer(async ({ render, toJSON, act }) => {
      let p, q, rootCount = 0;
      function Root({ location }) {
        const provide = useRouter({ location });
        rootCount++;
        return provide((parts, query) => {
          p = parts;
          q = query;
          const compA = createElement(CompA, { key: 'a' });
          const compB = createElement(CompB, { key: 'b' });
          return createElement(Fragment, {}, [ `${parts[0]}`, ' ', compA, ' ', compB ]);
        });
      }
      let compACount = 0;
      function CompA() {
        const [ parts, { a } ] = useRoute();
        compACount++;
        return `${parts[1]} ${a}`;
      }
      let compBCount = 0;
      function CompB() {
        const [ parts, { b } ] = useRoute();
        compBCount++;
        return `${parts[1]} ${b}`;
      }
      const el = createElement(Root, { location: 'http://example.test/hello/world/?a=1&b=123' });
      await render(el);
      expect(toJSON()).to.eql([ 'hello', ' ', 'world 1', ' ', 'world 123' ]);
      expect(rootCount).to.equal(1);
      expect(compACount).to.equal(1);
      expect(compBCount).to.equal(1);
      await act(() => {
        p[1] = 'universe';
        q.b = 178;
        p[1] = 'world';
        q.b = 123;
      });
      expect(toJSON()).to.eql([ 'hello', ' ', 'world 1', ' ', 'world 123' ]);
      expect(rootCount).to.equal(1);
      expect(compACount).to.equal(1);
      expect(compBCount).to.equal(1);
    });
  });
  it('should not update the root component unnecessarily when every is used', async function() {
    await withTestRenderer(async ({ render, toJSON, act }) => {
      let p, q, rootCount = 0;
      function Root({ location }) {
        const provide = useRouter({ location });
        rootCount++;
        return provide((parts, query) => {
          p = parts;
          q = query;
          const cheese = parts.every((e, index) => index < 3) ? 'cheddar' : 'roquefort';
          const compA = createElement(CompA, { key: 'a' });
          const compB = createElement(CompB, { key: 'b' });
          return createElement(Fragment, {}, [ cheese, ' ', compA, ' ', compB ]);
        });
      }
      let compACount = 0;
      function CompA() {
        const [ parts, { a } ] = useRoute();
        compACount++;
        return `${parts[1]} ${a}`;
      }
      let compBCount = 0;
      function CompB() {
        const [ parts, { b } ] = useRoute();
        compBCount++;
        return `${parts[1]} ${b}`;
      }
      const el = createElement(Root, { location: 'http://example.test/hello/world/?a=1&b=123' });
      await render(el);
      expect(toJSON()).to.eql([ 'cheddar', ' ', 'world 1', ' ', 'world 123' ]);
      expect(rootCount).to.equal(1);
      expect(compACount).to.equal(1);
      expect(compBCount).to.equal(1);
      await act(() => p[1] = 'universe');
      expect(toJSON()).to.eql([ 'cheddar', ' ', 'universe 1', ' ', 'universe 123' ]);
      expect(rootCount).to.equal(1);
      expect(compACount).to.equal(2);
      expect(compBCount).to.equal(2);
      await act(() => p.push('cow'));
      expect(toJSON()).to.eql([ 'cheddar', ' ', 'universe 1', ' ', 'universe 123' ]);
      expect(rootCount).to.equal(1);
      expect(compACount).to.equal(2);
      expect(compBCount).to.equal(2);
      await act(() => p.push('goat'));
      expect(toJSON()).to.eql([ 'roquefort', ' ', 'universe 1', ' ', 'universe 123' ]);
      expect(rootCount).to.equal(2);
      expect(compACount).to.equal(3);
      expect(compBCount).to.equal(3);
    });
  })
  it('should receive correct info when root component changes URL while rendering', async function() {
    await withTestRenderer(async ({ render, toJSON, act }) => {
      let p, q, rootCount = 0;
      function Root({ location }) {
        const provide = useRouter({ location });
        rootCount++;
        return provide((parts, query, { replacing }) => {
          p = parts;
          q = query;
          replacing(() => {
            parts[1] = 'universe';
            query.a = 88;
            query.b = 72;
          });
          const compA = createElement(CompA, { key: 'a' });
          const compB = createElement(CompB, { key: 'b' });
          return createElement(Fragment, {}, [ `${parts[0]}`, ' ', compA, ' ', compB ]);
        });
      }
      let compACount = 0;
      function CompA() {
        const [ parts, { a } ] = useRoute();
        compACount++;
        return `${parts[1]} ${a}`;
      }
      let compBCount = 0;
      function CompB() {
        const [ parts, { b } ] = useRoute();
        compBCount++;
        return `${parts[1]} ${b}`;
      }
      const el = createElement(Root, { location: 'http://example.test/hello/world/?a=1&b=123' });
      await render(el);
      expect(toJSON()).to.eql([ 'hello', ' ', 'universe 88', ' ', 'universe 72' ]);
      expect(rootCount).to.equal(1);
      expect(compACount).to.equal(1);
      expect(compBCount).to.equal(1);
    });
  })
  it('should receive correct info when another component changes URL while rendering', async function() {
    await withTestRenderer(async ({ render, toJSON }) => {
      let rootCount = 0;
      function Root({ location }) {
        const provide = useRouter({ location });
        rootCount++;
        return provide((parts, query) => {
          const compA = createElement(CompA, { key: 'a' });
          const compB = createElement(CompB, { key: 'b' });
          return createElement(Fragment, {}, [ `${parts[0]}`, ' ', compA, ' ', compB ]);
        });
      }
      let compACount = 0;
      function CompA() {
        const [ parts, { a } ] = useRoute();
        compACount++;
        return `${parts[1]} ${a}`;
      }
      let compBCount = 0;
      function CompB() {
        const [ parts, query, { replacing } ] = useRoute();
        const { b } = query;
        compBCount++;
        replacing(() => {
          parts[1] = 'universe';
          query.a = 88;
          query.b = 72;
        });
        return `${parts[1]} ${b}`;
      }
      const el = createElement(Root, { location: 'http://example.test/hello/world/?a=1&b=123' });
      await withSilentConsole(async () => {
        await render(el);
        expect(toJSON()).to.eql([ 'hello', ' ', 'universe 88', ' ', 'universe 72' ]);
        expect(rootCount).to.equal(1);
        expect(compACount).to.equal(2);
        expect(compBCount).to.equal(2);
      });
    });
  });
  it('should emit an error when attempting to change route without using replacing', async function() {
    await withTestRenderer(async ({ render, toJSON }) => {
      function Root({ location }) {
        const provide = useRouter({ location });
        return provide((parts, query) => {
          const compA = createElement(CompA, { key: 'a' });
          const compB = createElement(CompB, { key: 'b' });
          return createElement(Fragment, {}, [ `${parts[0]}`, ' ', compA, ' ', compB ]);
        });
      }
      function CompA() {
        const [ parts, { a } ] = useRoute();
        return `${parts[1]} ${a}`;
      }
      let error;
      function CompB() {
        const [ parts, query, { replacing } ] = useRoute();
        try {
          parts[1] = 'universe';
          query.a = 88;
          query.b = 72;
        } catch (err) {
          error = err;
        }
        const { b } = query;
        return `${parts[1]} ${b}`;
      }
      const el = createElement(Root, { location: 'http://example.test/hello/world/?a=1&b=123' });
      await render(el);
      expect(error).to.be.an('error').with.property('message', 'Use of replacing() is required in this context');
      expect(toJSON()).to.eql([ 'hello', ' ', 'world 1', ' ', 'universe 123' ]);
    });
  })
  it('should emit an error when calling replacing inside pushing or vice-versa', async function() {
    await withTestRenderer(async ({ render, toJSON }) => {
      function Root({ location }) {
        const provide = useRouter({ location });
        return provide((parts, query) => {
          const compA = createElement(CompA, { key: 'a' });
          const compB = createElement(CompB, { key: 'b' });
          return createElement(Fragment, {}, [ `${parts[0]}`, ' ', compA, ' ', compB ]);
        });
      }
      function CompA() {
        const [ parts, { a } ] = useRoute();
        return `${parts[1]} ${a}`;
      }
      let f1, f2;
      function CompB() {
        const [ parts, { b }, { replacing, pushing } ] = useRoute();
        f1 = () => {
          replacing(() => {
            pushing(() => {

            });
          });
        }
        f2 = () => {
          pushing(() => {
            replacing(() => {
            });
          });
        }
        return `${parts[1]} ${b}`;
      }
      const el = createElement(Root, { location: 'http://example.test/hello/world/?a=1&b=123' });
      await render(el);
      expect(f1).to.throw('Cannot use pushing() in this context');
      expect(f2).to.throw('Cannot use replacing() in this context');
    });
  })
  it('should send 404 error up to root component', async function() {
    await withTestRenderer(async ({ render, toJSON }) => {
      function Root({ location }) {
        const provide = useRouter({ location });
        return provide((parts, query) => {
          try {
            const compA = createElement(CompA, { key: 'a' });
            const compB = createElement(CompB, { key: 'b' });
            return createElement(Fragment, {}, [ `${parts[0]}`, ' ', compA, ' ', compB ]);
          } catch (err) {
            return err.message;
          }
        });
      }
      function CompA() {
        const [ parts, { a } ] = useRoute();
        return `${parts[1]} ${a}`;
      }
      function CompB() {
        const [ parts, { b }, { throw404 } ] = useRoute();
        throw404();
        return `${parts[1]} ${b}`;
      }
      const el = createElement(Root, { location: 'http://example.test/hello/world/?a=1&b=123' });
      await withSilentConsole(async () => {
        await render(el);
        expect(toJSON()).to.contain('Page not found');
      });
    });
  })
  it('should catch other errors as well', async function() {
    await withTestRenderer(async ({ render, toJSON }) => {
      function Root({ location }) {
        const provide = useRouter({ location });
        return provide((parts, query, { rethrow }) => {
          try {
            rethrow();
            const compA = createElement(CompA, { key: 'a' });
            const compB = createElement(CompB, { key: 'b' });
            return createElement(Fragment, {}, [ compA, ' ', compB ]);
          } catch (err) {
            return err.message;
          }
        });
      }
      function CompA() {
        const [ parts, { a } ] = useRoute();
        return `${parts[1]} ${a}`;
      }
      function CompB() {
        const [ parts, { b }, { throw404 } ] = useRoute();
        throw new Error('My hovercraft is ful of els');
        return `${parts[1]} ${b}`;
      }
      const el = createElement(Root, { location: 'http://example.test/hello/world/?a=1&b=123' });
      await withSilentConsole(async () => {
        await render(el);
        expect(toJSON()).to.contain('My hovercraft');
      });
    });
  })
  it('should clear last error when switching to new route', async function() {
    await withTestRenderer(async ({ render, toJSON, act }) => {
      let p, q;
      function Root({ location }) {
        const provide = useRouter({ location });
        return provide((parts, query, { rethrow }) => {
          p = parts;
          q = query;
          try {
            rethrow();
            const compA = createElement(CompA, { key: 'a' });
            const compB = createElement(CompB, { key: 'b' });
            return createElement(Fragment, {}, [ compA, ' ', compB ]);
          } catch (err) {
            return err.message;
          }
        });
      }
      function CompA() {
        const [ parts, { a } ] = useRoute();
        return `${parts[1]} ${a}`;
      }
      function CompB() {
        const [ parts, { b }, { throw404 } ] = useRoute();
        if (b === '123') {
          throw new Error('My hovercraft is ful of els');
        }
        return `${parts[1]} ${b}`;
      }
      const el = createElement(Root, { location: 'http://example.test/hello/world/?a=1&b=123' });
      await withSilentConsole(async () => {
        await render(el);
        expect(toJSON()).to.contain('My hovercraft');
      });
      await act(() => q.b = 144);
      expect(toJSON()).to.eql([ 'world 1', ' ', 'world 144' ]);
    });
  })
})

describe('#useLocation()', function() {
  it('should throw when context is missing', async function() {
    await withTestRenderer(async ({ render, toJSON }) => {
      let error;
      function Test() {
        try {
          useLocation();
        } catch (err) {
          error = err;
        }
        return 'Test';
      }
      const el = createElement(Test);
      await render(el);
      expect(error).to.be.an('error').with.property('message', 'No router context');
    });
  })
  it('should receive the current URL from parent component', async function() {
    await withTestRenderer(async ({ render, toJSON }) => {
      function Root({ location }) {
        const provide = useRouter({ location });
        return provide((parts, query) => {
          return createElement(Comp);
        });
      }
      function Comp() {
        const url = useLocation();
        return `${url}`
      }
      const el = createElement(Root, { location: 'http://example.test/hello/world/?a=1&b=123' });
      await render(el);
      // note the removal of the trailing slash
      expect(toJSON()).to.eql('http://example.test/hello/world?a=1&b=123');
    });
  })
  it('should receive updated URL when changes occur', async function() {
    await withTestRenderer(async ({ render, toJSON, act }) => {
      let p, q, rootCount = 0;
      function Root({ location }) {
        const provide = useRouter({ location });
        rootCount++;
        return provide((parts, query) => {
          p = parts;
          q = query;
          return createElement(Comp);
        });
      }
      let compCount = 0;
      function Comp() {
        const url = useLocation();
        compCount++;
        return `${url}`
      }
      const el = createElement(Root, { location: 'http://example.test/hello/world/?a=1&b=123' });
      await render(el);
      expect(toJSON()).to.eql('http://example.test/hello/world?a=1&b=123');
      await act(() => p[0] = 'die', p[1] = 'universe');
      expect(toJSON()).to.eql('http://example.test/die/universe?a=1&b=123');
      expect(toJSON()).to.eql('http://example.test/die/universe?a=1&b=123');
      await act(() => delete q.a, delete q.b);
      expect(toJSON()).to.eql('http://example.test/die/universe');
      await act(() => p.splice(0));
      expect(toJSON()).to.eql('http://example.test/');
    });
  })
  it('should receive URLs with trailing slash when that is enabled', async function() {
    await withTestRenderer(async ({ render, toJSON, act }) => {
      let p, q, rootCount = 0;
      function Root({ location }) {
        const provide = useRouter({ location, trailingSlash: true });
        rootCount++;
        return provide((parts, query) => {
          p = parts;
          q = query;
          return createElement(Comp);
        });
      }
      let compCount = 0;
      function Comp() {
        const url = useLocation();
        compCount++;
        return `${url}`
      }
      const el = createElement(Root, { location: 'http://example.test/hello/world/?a=1&b=123' });
      await render(el);
      expect(toJSON()).to.eql('http://example.test/hello/world/?a=1&b=123');
      await act(() => p[0] = 'die', p[1] = 'universe');
      expect(toJSON()).to.eql('http://example.test/die/universe/?a=1&b=123');
      expect(toJSON()).to.eql('http://example.test/die/universe/?a=1&b=123');
      await act(() => delete q.a, delete q.b);
      expect(toJSON()).to.eql('http://example.test/die/universe/');
      await act(() => p.splice(0));
      expect(toJSON()).to.eql('http://example.test/');
    });
  })
  it('should allow the trapping of changes due to click on link', async function() {
    await withJSDOM('http://example.test/hello', async () => {
      await withReactDOM(async ({ render, toJSON, act, node }) => {
        let error, p;
        function Test() {
          const provide = useRouter({ trailingSlash: true });
          return provide((parts, query, { trap }) => {
            p = parts;
            trap('detour', (err) => {
              error = err;
              return true;
            });
            return createElement('a', { href: '/somewhere?a=b' }, parts[0]);
          });
        }
        const el = createElement(Test);
        await render(el);
        expect(node.innerHTML).to.equal('<a href="/somewhere?a=b">hello</a>');
        const [ a ] = node.getElementsByTagName('A');
        await act(() => a.click());
        expect(error).to.be.instanceOf(RouteChangePending);
        expect(error.reason).to.equal('link');
        expect(error.source).to.have.property('tagName', 'A');
        expect(error.parts).to.eql([ 'somewhere' ]);
        expect(error.query).to.eql({ a: 'b' });
        expect(error.url.href).to.equal('http://example.test/somewhere?a=b');
        expect(error.internal).to.be.true;
        expect(node.innerHTML).to.equal('<a href="/somewhere?a=b">hello</a>');
        expect(window.location.href).to.equal('http://example.test/hello/');
        let settlementCount = 0;
        error.onSettlement = () => settlementCount++;
        await act(() => error.prevent());
        expect(window.location.href).to.equal('http://example.test/hello/');
        await act(() => a.click());
        error.onSettlement = () => settlementCount++;
        let p0 = p[0];
        expect(p0).to.equal('hello');
        await act(async () => {
          await error.proceed();
          // parts should contain new values at this point
          p0 = p[0];
        });
        expect(p0).to.equal('somewhere');
        expect(node.innerHTML).to.equal('<a href="/somewhere?a=b">somewhere</a>');
        expect(window.location.href).to.equal('http://example.test/somewhere/?a=b');
        expect(settlementCount).to.equal(2);
      });
    });
  })
  it('should not activate traps when there is a detour awaiting decision', async function() {
    await withJSDOM('http://example.test/hello', async () => {
      await withReactDOM(async ({ render, toJSON, act, node }) => {
        let error, count = 0;
        function Test() {
          const provide = useRouter({ trailingSlash: true });
          return provide((parts, query, { trap }) => {
            trap('detour', (err) => {
              count++;
              error = err;
              return true;
            });
            return createElement('a', { href: '/somewhere?a=b' }, parts[0]);
          });
        }
        const el = createElement(Test);
        await render(el);
        expect(node.innerHTML).to.equal('<a href="/somewhere?a=b">hello</a>');
        const [ a ] = node.getElementsByTagName('A');
        await act(() => a.click());
        expect(error).to.be.instanceOf(RouteChangePending);
        expect(count).to.equal(1);
        await act(() => a.click());
        expect(count).to.equal(1);
        await act(() => error.proceed());
        await act(() => a.click());
        expect(count).to.equal(2);
      });
    });
  })
  it('should allow the initiation of a detour programmatically', async function() {
    await withJSDOM('http://example.test/hello', async () => {
      await withReactDOM(async ({ render, toJSON, act, node }) => {
        let error, f, i;
        function Test() {
          const provide = useRouter({ trailingSlash: true });
          return provide((parts, query, { trap, detour, isDetour }) => {
            trap('detour', (err) => {
              error = err;
              return true;
            });
            f = detour;
            i = isDetour;
            return createElement('a', { href: '/somewhere?a=b' }, parts[0]);
          });
        }
        const el = createElement(Test);
        await render(el);
        expect(node.innerHTML).to.equal('<a href="/somewhere?a=b">hello</a>');
        expect(f).to.be.a('function');
        const promise1 = f([ 'somewhere' ], { a: 'b' });
        expect(i(error)).to.be.true;
        expect(error.reason).to.equal('link');
        expect(error.parts).to.eql([ 'somewhere' ]);
        expect(error.query).to.eql({ a: 'b' });
        expect(error.url.href).to.equal('http://example.test/somewhere/?a=b');
        expect(error.internal).to.be.true;
        expect(node.innerHTML).to.equal('<a href="/somewhere?a=b">hello</a>');
        expect(window.location.href).to.equal('http://example.test/hello/');
        await act(() => error.prevent());
        expect(window.location.href).to.equal('http://example.test/hello/');
        const result1 = await promise1;
        expect(result1).to.be.false;
        const promise2 = f([ 'somewhere' ], { a: 'b' });
        await act(() => error.proceed());
        expect(node.innerHTML).to.equal('<a href="/somewhere?a=b">somewhere</a>');
        expect(window.location.href).to.equal('http://example.test/somewhere/?a=b');
        const result2 = await promise2;
        expect(result2).to.be.true;
      });
    });
  })
  it('should not trap links that only cause hash changes', async function() {
    await withJSDOM('http://example.test/hello', async () => {
      await withReactDOM(async ({ render, toJSON, act, node }) => {
        let detour;
        function Test() {
          const provide = useRouter({ trailingSlash: true });
          return provide((parts, query, { trap }) => {
            trap('detour', (d) => {
              detour = d;
              return true;
            });
            return createElement('a', { href: '#world' }, parts[0]);
          });
        }
        const el = createElement(Test);
        await render(el);
        expect(node.innerHTML).to.equal('<a href="#world">hello</a>');
        const [ a ] = node.getElementsByTagName('A');
        await act(() => a.click());
        expect(detour).to.be.undefined;
      });
    });
  })
  it('should allow the trapping of changes due to calling of history.go', async function() {
    await withJSDOM('http://example.test/hello', async () => {
      await withReactDOM(async ({ render, toJSON, act, node }) => {
        let detour;
        function Test() {
          const provide = useRouter({ trailingSlash: true });
          return provide((parts, query, { trap }) => {
            trap('detour', (d) => {
              if (d.reason !== 'link') {
                detour = d;
                return true;
              }
            });
            return createElement('a', { href: '/somewhere' }, parts[0]);
          });
        }
        const el = createElement(Test);
        await render(el);
        expect(node.innerHTML).to.equal('<a href="/somewhere">hello</a>');
        const [ a ] = node.getElementsByTagName('A');
        await act(() => a.click());
        expect(node.innerHTML).to.equal('<a href="/somewhere">somewhere</a>');
        expect(window.location.href).to.equal('http://example.test/somewhere/');
        await act(async () => window.history.go(-1) ?? delay(10));
        expect(detour.reason).to.equal('back');
        expect(detour.source).to.be.null;
        expect(detour.parts).to.eql([ 'hello' ]);
        expect(detour.query).to.eql({});
        expect(detour.url.href).to.equal('http://example.test/hello/')
        expect(node.innerHTML).to.equal('<a href="/somewhere">somewhere</a>');
        await delay(10); // wait for reversion
        expect(window.location.href).to.equal('http://example.test/somewhere/');
        await act(() => detour.proceed());
        await delay(10);
        expect(node.innerHTML).to.equal('<a href="/somewhere">hello</a>');
        expect(window.location.href).to.equal('http://example.test/hello/');
        await act(async () => window.history.go(+1) ?? delay(10));
        expect(detour.url.href).to.equal('http://example.test/somewhere/')
        expect(detour.reason).to.equal('forward');
        expect(node.innerHTML).to.equal('<a href="/somewhere">hello</a>');
        expect(window.location.href).to.equal('http://example.test/hello/');
        await act(() => detour.proceed());
        await delay(10);
        expect(node.innerHTML).to.equal('<a href="/somewhere">somewhere</a>');
        expect(window.location.href).to.equal('http://example.test/somewhere/');
      });
    });
  })
  it('should install trap links to external pages', async function() {
    await withJSDOM('http://example.test/hello', async () => {
      await withReactDOM(async ({ render, toJSON, act, node }) => {
        let t;
        function Test() {
          const provide = useRouter({ trailingSlash: true });
          return provide((parts, query, { trap }) => {
            t = trap;
            return createElement('a', { href: 'http://somewhere.net/' }, parts[0]);
          });
        }
        const el = createElement(Test);
        await render(el);
        expect(node.innerHTML).to.equal('<a href="http://somewhere.net/">hello</a>');
        let detour;
        t('detour', (d) => {
          detour = d;
          return true;
        });
        const [ a ] = node.getElementsByTagName('A');
        await act(() => a.click());
        expect(detour.reason).to.equal('link');
        expect(detour.parts).to.be.null;
        expect(detour.query).to.be.null;
        expect(detour.internal).to.be.false;
        expect(detour.url.href).to.equal('http://somewhere.net/')
        expect(window.location.href).to.equal('http://example.test/hello/');
      });
    });
  })
})

describe('#useSequentialRouter()', function() {
  it('should create a router for async code', async function() {
    await withJSDOM('http://example.test/hello', async () => {
      await withReactDOM(async ({ render, toJSON, act, node }) => {
        let detour;
        function Test() {
          const [ parts, query, { trap }, { createContext, createBoundary } ] = useSequentialRouter();
          const [ text, setText ] = useState(parts[0]);
          trap('detour', async (d) => {
            detour = d;
            await act(() => detour);
            setText(parts[0]);
          });
          const el = createElement('a', { href: '/somewhere' }, text);
          const eb = createBoundary(el);
          return createContext(eb);
        }
        const el = createElement(Test);
        await render(el);
        expect(node.innerHTML).to.equal('<a href="/somewhere">hello</a>');
        const [ a ] = node.getElementsByTagName('A');
        await act(() => a.click());
        await act(() => detour.proceed());
        expect(node.innerHTML).to.equal('<a href="/somewhere">somewhere</a>');
      });
    });
  })
  it('should throw when proxy is accessed 1000 times in a row', async function() {
    await withJSDOM('http://example.test/hello', async () => {
      await withReactDOM(async ({ render, node }) => {
        let p;
        function Test() {
          const [ parts, query, {}, { createContext, createBoundary } ] = useSequentialRouter();
          p = parts;
          const el = createElement('a', { href: '/somewhere' }, parts[0]);
          const eb = createBoundary(el);
          return createContext(eb);
        }
        const el = createElement(Test);
        await render(el);
        expect(node.innerHTML).to.equal('<a href="/somewhere">hello</a>');
        const f = () => {
          let x = [];
          for (let i = 0; i < 1001; i++) {
            x.push(p[0]);
          }
        };
        expect(f).to.throw();
      });
    });
  })
  it('should handle non-standard URL', async function() {
    await withTestRenderer(async ({ render, toJSON, act }) => {
      const options = { 
        importMeta: import.meta, 
        flags: {
          rainbow: {
            type: 'boolean',
            alias: 'r'
          },
          camelName: {
            type: 'string',
            default: 'Sam',
            alias: 'n',
          }
        },
      };

      function parseURL(_, { pathname}) {
        const argv = parse(pathname);
        const { input: parts, flags: query } = meowparse(argv, options);
        setCoercionMethod(parts, v => v + '');
        return { parts, query };
      }

      function createURL(_, { parts: input, query: flags }) {
        const argv = meowrev({ input, flags }, options);
        const pathname = quote(argv);
        return new URL(`argv:${pathname}`);
      }

      const location = `argv:hello world -r --camel-name Donald`;
      let p, q;
      function Test1() {
        const options = { location, parseURL, createURL };
        const [ parts, query, {}, { createContext, createBoundary } ] = useSequentialRouter(options);
        p = parts;
        q = query;
        return `${parts[1]} ${query.camelName}`;
      }
      const el1 = createElement(Test1);
      await render(el1);
      expect(toJSON()).to.equal('world Donald');

      function Location() {
        const location = useLocation();
        return location.href;
      }
      function Test2() {
        const options = { location, parseURL, createURL };
        const [ parts, query, {}, { createContext, createBoundary } ] = useSequentialRouter(options);
        p = parts;
        q = query;
        return createContext(createElement(Location));
      }

      const el2 = createElement(Test2);
      await render(el2);
      expect(toJSON()).to.equal('argv:hello world --rainbow --camel-name Donald');
      expect(q).to.eql({ rainbow: true, camelName: 'Donald' });
      await act(() => q.camelName = 'Sam')
      expect(toJSON()).to.equal('argv:hello world --rainbow');
      await act(() => {
        p.push(1)
        // number should be coerced into string
        expect(p).to.eql([ 'hello', 'world', '1' ]);
      });
      expect(toJSON()).to.equal('argv:hello world 1 --rainbow');
      await act(() => {
        p.pop();
        q.rainbow = false;
        // no type coercion
        expect(q.rainbow).to.equal(false);
      })
      expect(toJSON()).to.equal('argv:hello world');
    });
  })
})

function nextTick() {
  return Promise.resolve();
}

function delay(ms, value) {
  return (new Promise(r => setTimeout(r, ms))).then(() => value);
}
