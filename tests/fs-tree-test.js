'use strict';

var fs = require('fs-extra');
var path = require('path');
var expect = require('chai').expect;
var walkSync = require('walk-sync');
var FSTree = require('../lib/index');
var Entry = require('../lib/entry');
var context = describe;
var defaultIsEqual = FSTree.defaultIsEqual;
var fsTree;

require('chai').config.truncateThreshold = 0;

describe('FSTree', function() {
  function merge(x, y) {
    var result = {};

    Object.keys(x || {}).forEach(function(key) {
      result[key] = x[key];
    });

    Object.keys(y || {}).forEach(function(key) {
      result[key] = y[key];
    });

    return result;
  }

  function MockEntry(options) {
    this.relativePath = options.relativePath;
    this.mode = options.mode;
    this.size = options.size;
    this.mtime = options.mtime;

    if (options.meta) {
      this.meta = options.meta;
    }
  }

  MockEntry.prototype.isDirectory = Entry.prototype.isDirectory;

  function metaIsEqual(a, b) {
    var aMeta = a.meta;
    var bMeta = b.meta;
    var metaKeys = aMeta ? Object.keys(aMeta) : [];
    var otherMetaKeys = bMeta ? Object.keys(bMeta) : [];

    if (metaKeys.length !== Object.keys(otherMetaKeys).length) {
      return false;
    } else {
      for (var i=0; i<metaKeys.length; ++i) {
        if (aMeta[metaKeys[i]] !== bMeta[metaKeys[i]]) {
          return false;
        }
      }
    }

    return true;
  }

  function userProvidedIsEqual(a, b) {
    return  defaultIsEqual(a, b) && metaIsEqual(a, b);
  }


  function file(relativePath, options) {
    return entry(merge({ relativePath: relativePath }, options));
  }

  function directory(relativePath, options) {
    return entry(merge({
      relativePath: relativePath,
      mode: 16877
    }, options));
  }

  function entry(options) {
    return new MockEntry({
      relativePath: options.relativePath,
      mode: options.mode || 0,
      size: options.size || 0,
      mtime: options.mtime || 0,
      meta: options.meta,
    });
  }

  function by(property) {
    return function pluckProperty(item) {
      return item[property];
    };
  }

  it('can be instantiated', function() {
    expect(new FSTree()).to.be.an.instanceOf(FSTree);
  });

  describe('.fromPaths', function() {
    it('creates empty trees', function() {
      fsTree = FSTree.fromPaths([ ]);
      expect(fsTree.size).to.eq(0);
    });

    describe('input validation', function() {
      it('throws on duplicate', function() {
        expect(function() {
          FSTree.fromPaths([
            'a',
            'a',
          ]);
        }).to.throw('expected entries[0]: `a` to be < entries[1]: `a`, but was not. Ensure your input is sorted and has no duplicate paths');
      });

      it('throws on unsorted', function() {
        expect(function() {
          FSTree.fromPaths([
            'b',
            'a',
          ]);
        }).to.throw('expected entries[0]: `b` to be < entries[1]: `a`, but was not. Ensure your input is sorted and has no duplicate paths');
      });
    });

    describe('options', function() {
      describe('sortAndExpand', function() {
        it('sorts input entries', function() {
          fsTree = FSTree.fromPaths([
            'foo/',
            'foo/a.js',
            'bar/',
            'bar/b.js',
          ], { sortAndExpand: true });

          expect(fsTree.entries.map(by('relativePath'))).to.deep.equal([
            'bar/',
            'bar/b.js',
            'foo/',
            'foo/a.js',
          ]);
        });

        it('expands intermediate directories implied by input entries', function() {
          fsTree = FSTree.fromPaths([
            'a/b/q/r/bar.js',
            'a/b/c/d/foo.js',
          ], { sortAndExpand: true });

          expect(fsTree.entries).to.deep.equal([
            directory('a/'),
            directory('a/b/'),
            directory('a/b/c/'),
            directory('a/b/c/d/'),
            file('a/b/c/d/foo.js'),
            directory('a/b/q/'),
            directory('a/b/q/r/'),
            file('a/b/q/r/bar.js'),
          ]);
        });

        it('does not mutate its input', function() {
          var paths = [
            'foo/',
            'foo/a.js',
            'bar/',
            'bar/b.js',
          ];
          fsTree = FSTree.fromPaths(paths, { sortAndExpand: true });

          expect(paths).to.deep.equal([
            'foo/',
            'foo/a.js',
            'bar/',
            'bar/b.js',
          ]);
        });
      });
    });

    it('creates trees from paths', function() {
      var result;

      fsTree = FSTree.fromPaths([
        'a.js',
        'foo/',
        'foo/a.js',
      ]);

      result = fsTree.calculatePatch(
        FSTree.fromPaths([
          'a.js',
          'foo/',
          'foo/b.js',
        ])
      );

      expect(result).to.deep.equal([
        ['unlink', 'foo/a.js', file('foo/a.js')],
        ['create', 'foo/b.js', file('foo/b.js')]
      ]);
    });
  });

  describe('.fromEntries', function() {

   describe('input validation', function() {
      it('throws on duplicate', function() {
        expect(function() {
          FSTree.fromEntries([
            file('a', { size: 1, mtime: 1 }),
            file('a', { size: 1, mtime: 2 }),
          ]);
        }).to.throw('expected entries[0]: `a` to be < entries[1]: `a`, but was not. Ensure your input is sorted and has no duplicate paths');
      });

      it('throws on unsorted', function() {
        expect(function() {
          FSTree.fromEntries([
            file('b'),
            file('a'),
          ]);
        }).to.throw('expected entries[0]: `b` to be < entries[1]: `a`, but was not. Ensure your input is sorted and has no duplicate paths');
      });
    });

    it('creates empty trees', function() {
      fsTree = FSTree.fromEntries([ ]);
      expect(fsTree.size).to.eq(0);
    });

    it('creates tree from entries', function() {
      var fsTree = FSTree.fromEntries([
        file('a/b.js', { size: 1, mtime: 1 }),
        file('a/c.js', { size: 1, mtime: 1 }),
        file('c/d.js', { size: 1, mtime: 1 }),
      ]);

      expect(fsTree.size).to.eq(3);

      var result = fsTree.calculatePatch(FSTree.fromEntries([
        file('a/b.js', { size: 1, mtime: 2 }),
        file('a/c.js', { size: 1, mtime: 1 }),
        file('c/d.js', { size: 1, mtime: 1 }),
       ]));

      expect(result).to.deep.equal([
        ['change', 'a/b.js', file('a/b.js', { mtime: 2, size: 1 })]
      ]);
    });
  });

  describe('adding new entries', function() {
    context(".addEntries", function() {
      context('input validation', function() {
        it('requires an array', function() {
          expect(function() {
              FSTree.fromPaths([]).addEntries(file('a.js'));
          }).to.throw(TypeError, 'entries must be an array');
        });

        it('throws on duplicate', function() {
          expect(function() {
            FSTree.fromEntries([]).addEntries([
              file('a', { size: 1, mtime: 1 }),
              file('a', { size: 1, mtime: 2 }),
            ]);
          }).to.throw('expected entries[0]: `a` to be < entries[1]: `a`, but was not. Ensure your input is sorted and has no duplicate paths');
        });

        it('throws on unsorted', function() {
          expect(function() {
            FSTree.fromEntries([]).addEntries([
              file('b'),
              file('a'),
            ]);
          }).to.throw('expected entries[0]: `b` to be < entries[1]: `a`, but was not. Ensure your input is sorted and has no duplicate paths');
        });
      });

      it('inserts one file into sorted location', function() {
        var result;

        fsTree = FSTree.fromPaths([
          'a.js',
          'foo/',
          'foo/a.js',
        ]);

        fsTree.addEntries([file('b.js', { size: 1, mtime: 1 })]);

        expect(fsTree.entries.map(by('relativePath'))).to.deep.equal([
          'a.js',
          'b.js',
          'foo/',
          'foo/a.js',
        ]);
      });

      it('inserts several entries', function() {
        var result;

        fsTree = FSTree.fromPaths([
          'a.js',
          'foo/',
          'foo/a.js',
        ]);

        fsTree.addEntries([
          file('bar/b.js', { size: 10, mtime: 10 }),
          file('1.js'),
          file('foo/bip/img.jpg'),
        ], {sortAndExpand: true});

        expect(fsTree.entries.map(by('relativePath'))).to.deep.equal([
          '1.js',
          'a.js',
          'bar/',
          'bar/b.js',
          'foo/',
          'foo/a.js',
          'foo/bip/',
          'foo/bip/img.jpg',
        ]);
      });

      it('replaces duplicates', function() {
        var result;

        fsTree = FSTree.fromPaths([
          'a.js',
          'foo/',
          'foo/a.js',
        ]);

        expect(fsTree.entries[2].mtime).to.equal(0);

        fsTree.addEntries([file('foo/a.js', { size: 10, mtime: 10 })], {sortAndExpand: true});

        expect(fsTree.entries.map(by('relativePath'))).to.deep.equal([
          'a.js',
          'foo/',
          'foo/a.js',
        ]);
        expect(fsTree.entries[2].mtime).to.equal(10);
      });
    });

    context(".addPaths", function() {
      it("passes through to .addEntries", function() {
        var result;

        fsTree = FSTree.fromPaths([
          'a.js',
          'foo/',
          'foo/a.js',
        ]);

        fsTree.addPaths([
          'bar/b.js',
          '1.js',
          'foo/bip/img.jpg'
        ], {sortAndExpand: true});

        expect(fsTree.entries.map(by('relativePath'))).to.deep.equal([
          '1.js',
          'a.js',
          'bar/',
          'bar/b.js',
          'foo/',
          'foo/a.js',
          'foo/bip/',
          'foo/bip/img.jpg',
        ]);
      });
    });
  });

  describe('#calculatePatch', function() {
    context('input validation', function() {
      expect(function() {
          FSTree.fromPaths([]).calculatePatch(FSTree.fromPaths([]), '');
      }).to.throw(TypeError, 'calculatePatch\'s second argument must be a function');
    });

    context('from an empty tree', function() {
      beforeEach( function() {
        fsTree = new FSTree();
      });

      context('to an empty tree', function() {
        it('returns 0 operations', function() {
          expect(fsTree.calculatePatch(FSTree.fromPaths([]))).to.deep.equal([]);
        });
      });

      context('to a non-empty tree', function() {
        it('returns n create operations', function() {
          expect(fsTree.calculatePatch(FSTree.fromPaths([
            'bar/',
            'bar/baz.js',
            'foo.js',
          ]))).to.deep.equal([
            ['mkdir',  'bar/',       directory('bar/')],
            ['create', 'bar/baz.js', file('bar/baz.js')],
            ['create', 'foo.js',     file('foo.js')],
          ]);
        });
      });
    });

    context('from a simple non-empty tree', function() {
      beforeEach( function() {
        fsTree = FSTree.fromPaths([
          'bar/',
          'bar/baz.js',
          'foo.js',
        ]);
      });

      context('to an empty tree', function() {
        it('returns n rm operations', function() {
          expect(fsTree.calculatePatch(FSTree.fromPaths([]))).to.deep.equal([
            ['unlink', 'foo.js',     file('foo.js')],
            ['unlink', 'bar/baz.js', file('bar/baz.js')],
            ['rmdir',  'bar/',       directory('bar/')],
          ]);
        });
      });
    });

    context('FSTree with entries', function() {
      context('of files', function() {
        beforeEach(function() {
          fsTree = new FSTree({
            entries: [
              directory('a/'),
              file('a/b.js', { mode: '0o666', size: 1, mtime: 1 }),
              file('a/c.js', { mode: '0o666', size: 1, mtime: 1 }),
              directory('c/'),
              file('c/d.js', { mode: '0o666', size: 1, mtime: 1, meta: { rev: 0 } })
            ]
          });
        });

        it('detects additions', function() {
          var result = fsTree.calculatePatch(new FSTree({
            entries: [
              directory('a/'),
              file('a/b.js', { mode: '0o666', size: 1, mtime: 1 }),
              file('a/c.js', { mode: '0o666', size: 1, mtime: 1 }),
              file('a/j.js', { mode: '0o666', size: 1, mtime: 1 }),
              directory('c/'),
              file('c/d.js', { mode: '0o666', size: 1, mtime: 1, meta: { rev: 0 } }),
            ]
          }));

          expect(result).to.deep.equal([
            ['create', 'a/j.js', file('a/j.js', { mode: '0o666', size: 1, mtime: 1 })]
          ]);
        });

        it('detects removals', function() {
          var result = fsTree.calculatePatch(new FSTree({
            entries: [
              directory('a/'),
              entry({ relativePath: 'a/b.js', mode: '0o666', size: 1, mtime: 1 })
            ]
          }));

          expect(result).to.deep.equal([
            ['unlink', 'c/d.js', file('c/d.js', { mode: '0o666', size: 1, mtime: 1, meta: { rev: 0 } })],
            ['rmdir',  'c/',     directory('c/')],
            ['unlink', 'a/c.js', file('a/c.js', { mode: '0o666', size: 1, mtime: 1 })],
          ]);
        });

        it('detects file updates', function() {
          var entries = [
            directory('a/'),
            file('a/b.js', { mode: '0o666', size: 1, mtime: 2 }),
            file('a/c.js', { mode: '0o666', size: 10, mtime: 1 }),
            directory('c/'),
            file('c/d.js', { mode: '0o666', size: 1, mtime: 1, meta: { rev: 1 } }),
          ];

          var result = fsTree.calculatePatch(new FSTree({
            entries: entries
          }), userProvidedIsEqual);

          expect(result).to.deep.equal([
            ['change', 'a/b.js', entries[1]],
            ['change', 'a/c.js', entries[2]],
            ['change', 'c/d.js', entries[4]],
          ]);
        });

        it('detects directory updates from user-supplied meta', function () {
          var entries = [
            directory('a/', { meta: { link: true } }),
            file('a/b.js', { mode: '0o666', size: 1, mtime: 1 }),
            file('a/c.js', { mode: '0o666', size: 1, mtime: 1 }),
            directory('c/'),
            file('c/d.js', { mode: '0o666', size: 1, mtime: 1, meta: { rev: 0 } })
          ];

          var result = fsTree.calculatePatch(new FSTree({
            entries: entries
          }), userProvidedIsEqual);

          expect(result).to.deep.equal([
            ['change', 'a/', entries[0]]
          ]);
        });

        it('passes the rhs user-supplied entry on updates', function () {
          var bEntry = file('a/b.js', {
            mode: '0o666', size: 1, mtime: 2, meta: { link: true }
          });
          var entries = [
              directory('a/'),
              bEntry,
              file('a/c.js', { mode: '0o666', size: 1, mtime: 1 }),
              directory('c/'),
              file('c/d.js', { mode: '0o666', size: 1, mtime: 1, meta: { rev: 0 } }),
          ];

          var result = fsTree.calculatePatch(new FSTree({
            entries: entries
          }));

          expect(result).to.deep.equal([
            ['change', 'a/b.js', bEntry],
          ]);
        });
      });
    });

    context('FSTree with updates at several different depths', function () {
      beforeEach( function() {
        fsTree = new FSTree({
          entries: [
            entry({ relativePath: 'a.js', mode: '0o666', size: 1, mtime: 1 }),
            entry({ relativePath: 'b.js', mode: '0o666', size: 1, mtime: 1 }),
            entry({ relativePath: 'one/a.js', mode: '0o666', size: 1, mtime: 1 }),
            entry({ relativePath: 'one/b.js', mode: '0o666', size: 1, mtime: 1 }),
            entry({ relativePath: 'one/two/a.js', mode: '0o666', size: 1, mtime: 1 }),
            entry({ relativePath: 'one/two/b.js', mode: '0o666', size: 1, mtime: 1 }),
          ]
        });
      });

      it('catches each update', function() {
        var result = fsTree.calculatePatch(new FSTree({
          entries: [
            entry({ relativePath: 'a.js', mode: '0o666', size: 1, mtime: 2 }),
            entry({ relativePath: 'b.js', mode: '0o666', size: 1, mtime: 1 }),
            entry({ relativePath: 'one/a.js', mode: '0o666', size: 10, mtime: 1 }),
            entry({ relativePath: 'one/b.js', mode: '0o666', size: 1, mtime: 1 }),
            entry({ relativePath: 'one/two/a.js', mode: '0o667', size: 1, mtime: 1 }),
            entry({ relativePath: 'one/two/b.js', mode: '0o666', size: 1, mtime: 1 }),
          ]
        }));

        expect(result).to.deep.equal([
          ['change', 'a.js', entry({ relativePath: 'a.js', size: 1, mtime: 2, mode: '0o666' })],
          ['change', 'one/a.js', entry({ relativePath: 'one/a.js', size: 10, mtime: 1, mode: '0o666'})],
          ['change', 'one/two/a.js', entry({ relativePath: 'one/two/a.js', mode: '0o667', size: 1, mtime: 1})],
        ]);
      });
    });

    context('with unchanged paths', function() {
      beforeEach( function() {
        fsTree = FSTree.fromPaths([
          'bar/',
          'bar/baz.js',
          'foo.js',
        ]);
      });

      it('returns an empty changeset', function() {
        expect(fsTree.calculatePatch(FSTree.fromPaths([
          'bar/',
          'bar/baz.js',
          'foo.js'
        ]))).to.deep.equal([
          // when we work with entries, will potentially return updates
        ]);
      });
    });


    context('from a non-empty tree', function() {
      beforeEach( function() {
        fsTree = FSTree.fromPaths([
          'bar/',
          'bar/one.js',
          'bar/two.js',
          'foo/',
          'foo/one.js',
          'foo/two.js',
        ]);
      });

      context('with removals', function() {
        it('reduces the rm operations', function() {
          expect(fsTree.calculatePatch(FSTree.fromPaths([
            'bar/',
            'bar/two.js'
          ]))).to.deep.equal([
            ['unlink', 'bar/one.js', file('bar/one.js')],
            ['unlink', 'foo/two.js', file('foo/two.js')],
            ['unlink', 'foo/one.js', file('foo/one.js')],
            ['rmdir',  'foo/',       directory('foo/')],
          ]);
        });
      });

      context('with removals and additions', function() {
        it('reduces the rm operations', function() {
          expect(fsTree.calculatePatch(FSTree.fromPaths([
            'bar/',
            'bar/three.js'
          ]))).to.deep.equal([
            ['unlink', 'bar/one.js',    file('bar/one.js')],
            ['unlink', 'foo/two.js',    file('foo/two.js')],
            ['unlink', 'foo/one.js',    file('foo/one.js')],
            ['rmdir',  'foo/',          directory('foo/')],
            ['unlink', 'bar/two.js',    file('bar/two.js')],
            ['create', 'bar/three.js',  file('bar/three.js')],
          ]);
        });
      });
    });

    context('from a deep non-empty tree', function() {
      beforeEach( function() {
        fsTree = FSTree.fromPaths([
          'bar/',
          'bar/quz/',
          'bar/quz/baz.js',
          'foo.js',
        ]);
      });

      context('to an empty tree', function() {
        it('returns n rm operations', function() {
          expect(fsTree.calculatePatch(FSTree.fromPaths([]))).to.deep.equal([
            ['unlink', 'foo.js',          file('foo.js')],
            ['unlink', 'bar/quz/baz.js',  file('bar/quz/baz.js')],
            ['rmdir', 'bar/quz/',         directory('bar/quz/')],
            ['rmdir', 'bar/',             directory('bar/')],
          ]);
        });
      });
    });

    context('from a deep non-empty tree \w intermediate entry', function() {
      beforeEach( function() {
        fsTree = FSTree.fromPaths([
          'bar/',
          'bar/foo.js',
          'bar/quz/',
          'bar/quz/baz.js',
        ]);
      });

      context('to an empty tree', function() {
        it('returns one unlink operation', function() {
          expect(fsTree.calculatePatch(FSTree.fromPaths([
            'bar/',
            'bar/quz/',
            'bar/quz/baz.js'
          ]))).to.deep.equal([
            ['unlink', 'bar/foo.js', file('bar/foo.js')]
          ]);
        });
      });
    });

    context('another nested scenario', function() {
      beforeEach( function() {
        fsTree = FSTree.fromPaths([
          'subdir1/',
          'subdir1/subsubdir1/',
          'subdir1/subsubdir1/foo.png',
          'subdir2/',
          'subdir2/bar.css'
        ]);
      });

      context('to an empty tree', function() {
        it('returns one unlink operation', function() {
          expect(fsTree.calculatePatch(FSTree.fromPaths([
            'subdir1/',
            'subdir1/subsubdir1/',
            'subdir1/subsubdir1/foo.png'
          ]))).to.deep.equal([
            ['unlink', 'subdir2/bar.css', file('subdir2/bar.css')],
            ['rmdir',  'subdir2/',        directory('subdir2/')]
          ]);
        });
      });
    });

    context('folder => file', function() {
      beforeEach( function() {
        fsTree = FSTree.fromPaths([
          'subdir1/',
          'subdir1/foo'
        ]);
      });

      it('it unlinks the file, and rmdir the folder and then creates the file', function() {
        expect(fsTree.calculatePatch(FSTree.fromPaths([
          'subdir1'
        ]))).to.deep.equal([
          ['unlink', 'subdir1/foo', file('subdir1/foo')],
          ['rmdir',  'subdir1/',    directory('subdir1/')],
          ['create', 'subdir1',     file('subdir1')],
        ]);
      });
    });

    context('file => folder', function() {
      beforeEach( function() {
        fsTree = FSTree.fromPaths([
          'subdir1'
        ]);
      });

      it('it unlinks the file, and makes the folder and then creates the file', function() {
        expect(fsTree.calculatePatch(FSTree.fromPaths([
          'subdir1/',
          'subdir1/foo'
        ]))).to.deep.equal([
          ['unlink', 'subdir1',     file('subdir1')],
          ['mkdir',  'subdir1/',    directory('subdir1/')],
          ['create', 'subdir1/foo', file('subdir1/foo')]
        ]);
      });
    });

    context('folders', function() {
      beforeEach( function() {
        fsTree = FSTree.fromPaths([
          'dir/',
          'dir2/',
          'dir2/subdir1/',
          'dir3/',
          'dir3/subdir1/'
        ]);
      });

      it('it unlinks the file, and makes the folder and then creates the file', function() {
        var result = fsTree.calculatePatch(FSTree.fromPaths([
          'dir2/',
          'dir2/subdir1/',
          'dir3/',
          'dir4/',
        ]));

        expect(result).to.deep.equal([
          ['rmdir', 'dir3/subdir1/',  directory('dir3/subdir1/')],
          ['rmdir', 'dir/',           directory('dir/')],
          // This no-op (rmdir dir3; mkdir dir3) is not fundamental: a future
          // iteration could reasonably optimize it away
          ['mkdir', 'dir4/',          directory('dir4/')],
        ]);
      });
    });

    context('walk-sync like tree', function () {
      beforeEach( function() {
        fsTree = new FSTree({
          entries: [
            entry(directory('parent/')),
            entry(directory('parent/subdir/')),
            entry(file('parent/subdir/a.js'))
          ]
        });
      });

      it('moving a file out of a directory does not edit directory structure', function () {
        var newTree = new FSTree({
          entries: [
            entry(directory('parent/')),
            entry(file('parent/a.js')),
            entry(directory('parent/subdir/')),
          ]
        });
        var result = fsTree.calculatePatch(newTree);

        expect(result).to.deep.equal([
          ['unlink', 'parent/subdir/a.js',  file('parent/subdir/a.js')],
          ['create', 'parent/a.js',         file('parent/a.js')],
        ]);
      });

      it('moving a file out of a subdir and removing the subdir does not recreate parent', function () {
        var newTree = new FSTree({
          entries: [
            entry(directory('parent/')),
            entry(file('parent/a.js'))
          ]
        });
        var result = fsTree.calculatePatch(newTree);

        expect(result).to.deep.equal([
          ['unlink', 'parent/subdir/a.js',  file('parent/subdir/a.js')],
          ['rmdir', 'parent/subdir/',       directory('parent/subdir/')],
          ['create', 'parent/a.js',         file('parent/a.js')],
        ]);
      });

      it('moving a file into nest subdir does not recreate subdir and parent', function () {
        var newTree = new FSTree({
          entries: [
            entry(directory('parent/')),
            entry(directory('parent/subdir/')),
            entry(directory('parent/subdir/subdir/')),
            entry(file('parent/subdir/subdir/a.js'))
          ]
        });
        var result = fsTree.calculatePatch(newTree);

        expect(result).to.deep.equal([
          ['unlink', 'parent/subdir/a.js',        file('parent/subdir/a.js')],
          ['mkdir', 'parent/subdir/subdir/',      directory('parent/subdir/subdir/')],
          ['create', 'parent/subdir/subdir/a.js', file('parent/subdir/subdir/a.js')],
        ]);
      });

      it('always remove files first if dir also needs to be removed', function() {
        var newTree = new FSTree({
          entries: [
            entry(directory('parent/'))
          ]
        });

        var result = fsTree.calculatePatch(newTree);

        expect(result).to.deep.equal([
          ['unlink', 'parent/subdir/a.js',  file('parent/subdir/a.js')],
          ['rmdir', 'parent/subdir/',       directory('parent/subdir/')]
        ]);
      });

      it('renaming a subdir does not recreate parent', function () {
        var newTree = new FSTree({
          entries: [
            entry(directory('parent/')),
            entry(directory('parent/subdir2/')),
            entry(file('parent/subdir2/a.js'))
          ]
        });

        var result = fsTree.calculatePatch(newTree);

        expect(result).to.deep.equal([
          ['unlink', 'parent/subdir/a.js',  file('parent/subdir/a.js')],
          ['rmdir', 'parent/subdir/',       directory('parent/subdir/')],
          ['mkdir', 'parent/subdir2/',      directory('parent/subdir2/')],
          ['create', 'parent/subdir2/a.js', file('parent/subdir2/a.js')],
        ]);
      });
    });
  });

  describe('.applyPatch', function() {
    var inputDir = 'tmp/fixture/input';
    var outputDir = 'tmp/fixture/output';

    beforeEach(function() {
      fs.mkdirpSync(inputDir);
      fs.mkdirpSync(outputDir);
    });

    afterEach(function() {
      fs.removeSync('tmp');
    });

    it('applies all types of operations', function() {
      var firstTree = FSTree.fromEntries(walkSync.entries(inputDir));

      var fooIndex = path.join(inputDir, 'foo/index.js');
      var barIndex = path.join(inputDir, 'bar/index.js');
      var barOutput = path.join(outputDir, 'bar/index.js')

      fs.outputFileSync(fooIndex, 'foo'); // mkdir + create
      fs.outputFileSync(barIndex, 'bar'); // mkdir + create

      var secondTree = FSTree.fromEntries(walkSync.entries(inputDir));
      var patch = firstTree.calculatePatch(secondTree);

      FSTree.applyPatch(inputDir, outputDir, patch);
      expect(walkSync(outputDir)).to.deep.equal([
        'bar/',
        'bar/index.js',
        'foo/',
        'foo/index.js'
      ]);
      expect(fs.readFileSync(barOutput, 'utf-8')).to.equal('bar');

      fs.removeSync(path.dirname(fooIndex)); // unlink + rmdir
      fs.outputFileSync(barIndex, 'boo'); // change

      var thirdTree = FSTree.fromEntries(walkSync.entries(inputDir));
      patch = secondTree.calculatePatch(thirdTree);

      FSTree.applyPatch(inputDir, outputDir, patch);
      expect(walkSync(outputDir)).to.deep.equal([
        'bar/',
        'bar/index.js'
      ]);
      expect(fs.readFileSync(barOutput, 'utf-8')).to.equal('boo');
    });

    it('supports custom delegate methods', function() {
      var inputDir = 'tmp/fixture/input';
      var outputDir = 'tmp/fixture/output';

      var stats = {
        unlink: 0,
        rmdir: 0,
        mkdir: 0,
        change: 0,
        create: 0
      };
      var delegate = {
        unlink: function() {
          stats.unlink++;
        },
        rmdir: function() {
          stats.rmdir++;
        },
        mkdir: function() {
          stats.mkdir++;
        },
        change: function() {
          stats.change++;
        },
        create: function() {
          stats.create++;
        }
      };

      var patch = [
        [ 'mkdir', 'bar/' ],
        [ 'create', 'bar/index.js' ],
        [ 'mkdir', 'foo/' ],
        [ 'create', 'foo/index.js' ],
        [ 'unlink', 'foo/index.js' ],
        [ 'rmdir', 'foo/' ],
        [ 'change', 'bar/index.js' ]
      ];

      FSTree.applyPatch(inputDir, outputDir, patch, delegate);

      expect(stats).to.deep.equal({
        unlink: 1,
        rmdir: 1,
        mkdir: 2,
        change: 1,
        create: 2
      });
    });

    it('throws an error when a patch has an unknown operation type', function() {
      var patch = [ [ 'delete', '/foo.js' ] ];
      expect(function() {
        FSTree.applyPatch('/fixture/input', '/fixture/output', patch)
      }).to.throw('Unable to apply patch operation: delete. The value of delegate.delete is of type undefined, and not a function. Check the `delegate` argument to `FSTree.prototype.applyPatch`.');
    });
  });

  describe('.calculateAndApplyPatch', function() {
    var inputDir = 'tmp/fixture/input';
    var outputDir = 'tmp/fixture/output';

    beforeEach(function() {
      fs.mkdirpSync(inputDir);
      fs.mkdirpSync(outputDir);
    });

    afterEach(function() {
      fs.removeSync('tmp');
    });

    it('calculates and applies a patch properly', function() {
      var firstTree = FSTree.fromEntries(walkSync.entries(inputDir));

      var fooIndex = path.join(inputDir, 'foo/index.js');
      var barIndex = path.join(inputDir, 'bar/index.js');
      var barOutput = path.join(outputDir, 'bar/index.js')

      fs.outputFileSync(fooIndex, 'foo');
      fs.outputFileSync(barIndex, 'bar');

      var secondTree = FSTree.fromEntries(walkSync.entries(inputDir));
      firstTree.calculateAndApplyPatch(secondTree, inputDir, outputDir);

      expect(walkSync(outputDir)).to.deep.equal([
        'bar/',
        'bar/index.js',
        'foo/',
        'foo/index.js'
      ]);
    });

    it('calculates and applies a patch properly with custom delegates', function() {
      var stats = {
        mkdir: 0,
        create: 0
      };
      var delegate = {
        mkdir: function() {
          stats.mkdir++;
        },
        create: function() {
          stats.create++;
        }
      };

      var firstTree = FSTree.fromEntries(walkSync.entries(inputDir));

      var fooIndex = path.join(inputDir, 'foo/index.js');
      var barIndex = path.join(inputDir, 'bar/index.js');

      fs.outputFileSync(fooIndex, 'foo');
      fs.outputFileSync(barIndex, 'bar');

      var secondTree = FSTree.fromEntries(walkSync.entries(inputDir));
      firstTree.calculateAndApplyPatch(secondTree, inputDir, outputDir, delegate);

      expect(stats).to.deep.equal({
        mkdir: 2,
        create: 2
      });
    });
  });
});
