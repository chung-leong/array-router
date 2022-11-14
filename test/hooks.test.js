import { expect } from 'chai';
import { createElement, Fragment } from 'react';
import { withTestRenderer } from './test-renderer.js';

import {
  useRouter,
  useRoute,
  useLocation,
} from '../index.js';

global.location = 'http://example.test/somewhere/';

describe('#useRouter()', function() {
  it('should return a function', async function() {
    await withTestRenderer(async ({ create, toJSON }) => {
      let f;
      function Test() {
        const provide = useRouter();
        f = provide;
        return 'TEST';
      }
      const el = createElement(Test);
      await create(el);
      expect(toJSON()).to.equal('TEST');
      expect(f).to.be.a('function');
    });
  })
  it('should correctly parse the path and query', async function() {
    await withTestRenderer(async ({ create, toJSON }) => {
      let p, q;
      function Test({ location }) {
        const provide = useRouter({ location });
        return provide((parts, query) => {
          p = parts;
          q = query;
          return 'TEST';
        });
      }
      const el = createElement(Test, { location: 'http://example.test/hello/world/?a=1&b=123' });
      await create(el);
      expect(toJSON()).to.equal('TEST');
      expect(p).to.eql([ 'hello', 'world' ]);
      expect(q).to.eql({ a: '1', b: '123' });
      expect(Object.keys(p)).to.eql([ '0', '1' ]);
      expect(Object.keys(q)).to.eql([ 'a', 'b' ]);
    });
  })
  it('should rerender when a change is made to the path', async function() {
    await withTestRenderer(async ({ create, toJSON, act }) => {
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
      await create(el);
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
    await withTestRenderer(async ({ create, toJSON, act }) => {
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
      await create(el);
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
})

describe('#useRoute()', function() {
  it('should throw when context is missing', async function() {
    await withTestRenderer(async ({ create, toJSON }) => {
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
      await create(el);
      expect(error).to.be.an('error').with.property('message', 'No router context');
    });
  })
  it('should receive route from parent component', async function() {
    await withTestRenderer(async ({ create, toJSON, act }) => {
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
        return `${parts[1]} ${a}`
      }
      function CompB() {
        const [ parts, { b } ] = useRoute();
        return `${parts[1]} ${b}`
      }
      const el = createElement(Root, { location: 'http://example.test/hello/world/?a=1&b=123' });
      await create(el);
      expect(toJSON()).to.eql([ 'hello', ' ', 'world 1', ' ', 'world 123' ]);
    });
  })
  it('should update the components when route changes', async function() {
    await withTestRenderer(async ({ create, toJSON, act }) => {
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
        return `${parts[1]} ${a}`
      }
      let compBCount = 0;
      function CompB() {
        const [ parts, { b } ] = useRoute();
        compBCount++;
        return `${parts[1]} ${b}`
      }
      const el = createElement(Root, { location: 'http://example.test/hello/world/?a=1&b=123' });
      await create(el);
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
})

describe('#useLocation', function() {
  it('should throw when context is missing', async function() {
    await withTestRenderer(async ({ create, toJSON }) => {
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
      await create(el);
      expect(error).to.be.an('error').with.property('message', 'No router context');
    });
  })
  it('should receive the current URL from parent component', async function() {
    await withTestRenderer(async ({ create, toJSON }) => {
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
      await create(el);
      // note the removal of the trailing slash
      expect(toJSON()).to.eql('http://example.test/hello/world?a=1&b=123');
    });
  })
  it('should receive updated URL when changes occur', async function() {
    await withTestRenderer(async ({ create, toJSON, act }) => {
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
      await create(el);
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
})
