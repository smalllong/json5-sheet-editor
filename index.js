var L = Lightue,
  selecting = false,
  selectStart,
  resolveColor

function toolButton(content, onclick) {
  return L.button({
    _type: 'button',
    onclick: onclick,
    $$: content,
  })
}

function between(value, min, range) {
  return value >= min && value < min + range
}

function genArr(length, init) {
  return 's'
    .repeat(length)
    .split('')
    .map(() => duplicate(init))
}

function duplicate(obj) {
  return JSON.parse(JSON.stringify(obj))
}

function clean(table) {
  var result = duplicate(table)
  result.forEach((row) => {
    row.forEach((cell, i) => {
      if (typeof cell == 'object') {
        var keys = Object.keys(cell)
        if (keys.length == 1 && keys[0] == 'v') row[i] = cell.v
      }
    })
  })
  return result
}

function setCell(row, i, key, value) {
  if (typeof row[i] == 'string') {
    if (key == 'v') row[i] = value
    else {
      var tmp = { v: row[i] }
      tmp[key] = value
      row[i] = tmp
    }
  } else if (typeof row[i] == 'object') row[i][key] = value
}

function download(format) {
  var link = document.createElement('a')
  link.download = 'table.' + format
  link.type = 'text/' + format
  link.href = URL.createObjectURL(new Blob([(format == 'json' ? JSON : JSON5).stringify(clean(S.table))]))
  link.click()
}

function openFile(file) {
  var fr = new FileReader(),
    name = file.name
  fr.readAsText(file)
  fr.onload = (e) => {
    var parser = name.endsWith('.json') ? JSON : JSON5,
      result = parser.parse(fr.result)
    mergeManager.load(result)
    S.table = result
  }
}

var mergeManager = {
  table: new Proxy([], {
    get: function (src, key) {
      if (src[key] == null) src[key] = []
      return src[key]
    },
  }), // false: standalone cell, 0: merge header, arr: merged cell
  isGoastCell: function (cell) {
    return cell && !cell.isHeader
  },
  splitPaste: function (top, left, height, width, tableState) {
    this.loopArea(top, left, height, width, (row, col) => {
      if (this.isGoastCell(this.table[row][col])) {
        if (this.table[row][col].rect[0] < top || this.table[row][col].rect[1] < left) {
          this.split(...this.table[row][col].rect, tableState)
        }
      }
    })
    this.split(top, left, height, width, tableState)
  },
  split: function (top, left, height, width, tableState) {
    var tableClone = duplicate(tableState.slice(top, top + height))
    this.loopArea(top, left, height, width, tableState, tableClone, (row, col, mcol) => {
      if (this.table[row][col] && this.table[row][col].isHeader) {
        if (typeof tableClone[row - top][mcol] == 'object') {
          delete tableClone[row - top][mcol].rs
          delete tableClone[row - top][mcol].cs
        }
      } else if (this.table[row][col]) tableClone[row - top].splice(mcol, 0, '')
      this.table[row][col] = false
    })
  },
  addMerge: function (top, left, height, width, tableState) {
    var newMerge = [top, left, height, width]
    tableState && this.split(...newMerge, tableState)
    var tableClone = tableState && duplicate(tableState.slice(top, top + height))
    this.loopArea(...newMerge, tableState, tableClone, (row, col, mcol, header) => {
      if (tableClone) {
        if (header) {
          setCell(tableClone[0], mcol, 'rs', height)
          setCell(tableClone[0], mcol, 'cs', width)
        } else if (!header && !this.table[row][col]) tableClone[row - top].splice(mcol, 1)
      }
      this.table[row][col] = header ? { isHeader: true, rect: newMerge } : { rect: newMerge }
    })
  },
  getVisualCol: function (row, col) {
    var result = -1
    for (; col >= 0; col--) {
      result++
      while (this.isGoastCell(this.table[row][result])) result++
    }
    return result
  },
  getModelCol: function (row, col) {
    var result = 0
    for (var i = 0; i < col; i++) {
      if (!this.isGoastCell(this.table[row][i])) result++
    }
    return result
  },
  include: function (outer, inner) {
    inner = inner && inner.rect
    if (inner) {
      if (inner[0] < outer[0]) {
        outer[2] += outer[0] - inner[0]
        outer[0] = inner[0]
      }
      if (inner[1] < outer[1]) {
        outer[3] += outer[1] - inner[1]
        outer[1] = inner[1]
      }
      if (inner[2] + inner[0] > outer[2] + outer[0]) outer[2] = inner[2] + inner[0] - outer[0]
      if (inner[3] + inner[1] > outer[3] + outer[1]) outer[3] = inner[3] + inner[1] - outer[1]
    }
  },
  getSelected: function (top0, left0, top1, left1) {
    var result = [Math.min(top0, top1), Math.min(left0, left1), Math.abs(top0 - top1) + 1, Math.abs(left0 - left1) + 1],
      lastResult = []
    while (JSON.stringify(result) != JSON.stringify(lastResult)) {
      lastResult = result.map((a) => a)
      for (var i = result[1]; i < result[1] + result[3]; i++) {
        this.include(result, this.table[result[0]][i])
        this.include(result, this.table[result[0] + result[2] - 1][i])
      }
      for (var i = result[0] + 1; i < result[0] + result[2] - 1; i++) {
        this.include(result, this.table[i][result[1]])
        this.include(result, this.table[i][result[1] + result[3] - 1])
      }
    }
    return {
      top: result[0],
      left: result[1],
      height: result[2],
      width: result[3],
    }
  },
  loopArea: function (top, left, height, width, tableState, tableClone, callback) {
    if (typeof tableState == 'function') {
      callback = tableState
      tableState = null
    }
    for (var i = 0; i < height; i++) {
      var mcol = 0
      for (var j = 0; j < left + width; j++) {
        if (between(j, left, width)) callback.call(this, top + i, j, mcol, i == 0 && j == left)
        if (!this.isGoastCell(this.table[top + i][j])) mcol++
      }
      tableClone && (tableState[top + i] = tableClone[i])
    }
  },
  addRow: function (tableState) {
    var cols = this.getCols(tableState[0])
    tableState.push(genArr(cols, ''))
  },
  getCols: function (tableStateRow) {
    return tableStateRow.reduce((pre, cur) => pre + (cur.cs || 1), 0)
  },
  fill: function (top, left, tds, tableState) {
    if (tds.length) {
      var cols = tds[0].reduce((pre, cur) => pre + (cur.colSpan || 1), 0),
        colsCurrent = this.getCols(tableState[0])
      tdsClone = tds.map((row) => row.map((cell) => cell))
      while (tableState.length < top + tds.length) {
        this.addRow(tableState)
      }
      for (var i = 0; i < left + cols - colsCurrent; i++) {
        tableState.forEach((row) => row.push(''))
      }
      this.splitPaste(top, left, tds.length, cols, tableState)
      this.loopArea(top, left, tdsClone.length, cols, (row, col) => {
        if (this.table[row][col]) return
        var td = tdsClone[row - top].shift()
        if (td.rowSpan > 1 || td.colSpan > 1) {
          this.addMerge(row, col, td.rowSpan || 1, td.colSpan || 1, tableState)
        }
      })
      var tableClone = duplicate(tableState.slice(top, top + tds.length))
      this.loopArea(top, left, tds.length, cols, tableState, tableClone, (row, col, mcol) => {
        if (this.isGoastCell(this.table[row][col])) return
        var td = tds[row - top].shift()
        setCell(tableClone[row - top], mcol, 'v', td.textContent)
        setCell(tableClone[row - top], mcol, 'bc', td.style.backgroundColor)
        setCell(tableClone[row - top], mcol, 'fc', td.style.color)
      })
    }
  },
  load: function (tableData) {
    this.table.splice(0, this.table.length)
    var cols = tableData[0].reduce((pre, cur) => pre + (cur.cs || 1), 0)
    this.loopArea(0, 0, tableData.length, cols, (row, col, mcol) => {
      if (this.table[row][col]) return
      var cell = tableData[row][mcol]
      if (cell.rs > 1 || cell.cs > 1) {
        this.addMerge(row, col, cell.rs || 1, cell.cs || 1)
      }
    })
  },
}

var S = L.useState({
  table: genArr(16, genArr(8, '')),
  selected: {
    // based on visual pos
    top: 0,
    left: 0,
    height: 1,
    width: 1,
  },
  curColors: {
    bc: '#ffffff',
    fc: '#000000',
  },
  colorPickerVisible: false,
})

function endSelect() {
  selecting = false
  curData = S.table[S.selected.top][mergeManager.getModelCol(S.selected.top, S.selected.left)]
  S.curColors.bc = curData.bc || '#ffffff'
  S.curColors.fc = curData.fc || '#000000'
}

function handleSelect(e, end) {
  if (selecting && e.target.dataset.visualPos) {
    var selectEnd = e.target.dataset.visualPos.split(',').map(Number)
    S.selected = mergeManager.getSelected(...selectStart, ...selectEnd)
    end && endSelect()
  } else if (selecting) endSelect()
}

function chooseColor(input, key) {
  S.colorPickerVisible = true
  resolveColor = (c) => {
    S.colorPickerVisible = false
    c = c == 'transparent' ? '' : c
    mergeManager.loopArea(
      S.selected.top,
      S.selected.left,
      S.selected.height,
      S.selected.width,
      function (row, col, mcol) {
        if (this.isGoastCell(this.table[row][col])) return
        setCell(S.table[row], mcol, key, c)
      }
    )
    input.value = c
  }
}

var vm = L({
  toolbar: {
    open: L.input({
      _type: 'file',
      _accept: '.json5,text/json5,.json,text/json,application/json',
      onchange: function (e) {
        openFile(this.files[0])
      },
    }),
    newRow: toolButton('新行', function (e) {
      mergeManager.addRow(S.table)
    }),
    newColumn: toolButton('新列', function (e) {
      S.table.forEach((row) => row.push(''))
    }),
    newRow2: toolButton('新2行', function (e) {
      mergeManager.addRow(S.table)
      mergeManager.addRow(S.table)
    }),
    newColumn2: toolButton('新2列', function (e) {
      S.table.forEach((row) => row.push(''))
      S.table.forEach((row) => row.push(''))
    }),
    $_bgColor: {
      $$: L.input({
        _type: 'color',
        $value: () => S.curColors.bc,
        onchange: function (e) {
          mergeManager.loopArea(
            S.selected.top,
            S.selected.left,
            S.selected.height,
            S.selected.width,
            function (row, col, mcol) {
              if (this.isGoastCell(this.table[row][col])) return
              setCell(S.table[row], mcol, 'bc', e.target.value)
            }
          )
        },
      }),
      choices: toolButton('▼', (e) => chooseColor(e.target.previousElementSibling, 'bc')),
    },
    $_color: {
      $$: L.input({
        _type: 'color',
        $value: () => S.curColors.fc,
        onchange: function (e) {
          mergeManager.loopArea(
            S.selected.top,
            S.selected.left,
            S.selected.height,
            S.selected.width,
            function (row, col, mcol) {
              if (this.isGoastCell(this.table[row][col])) return
              setCell(S.table[row], mcol, 'fc', e.target.value)
            }
          )
        },
      }),
      choices: toolButton('▼', (e) => chooseColor(e.target.previousElementSibling, 'fc')),
    },
    combine: toolButton('合并', function (e) {
      mergeManager.addMerge(S.selected.top, S.selected.left, S.selected.height, S.selected.width, S.table)
    }),
    split: toolButton('分解', function (e) {
      mergeManager.split(S.selected.top, S.selected.left, S.selected.height, S.selected.width, S.table)
    }),
    saveJson: toolButton('保存json', function (e) {
      download('json')
    }),
    saveJson5: toolButton('保存json5', function (e) {
      download('json5')
    }),
  },
  mainTable: L.table({
    _style: () => (S.bgColor ? 'background-color:' + S.bgColor : ''),
    header: L.tr({
      headerLeft: L.td(),
      $$: () => L.for(mergeManager.getCols(S.table[0]), (i) => L.td.headerTop(String.fromCharCode(65 + i))),
    }),
    $$: () => {
      return S.table.map((row, i) =>
        L.tr({
          headerLeft: L.td(i + 1),
          $$: row.map((cell, j) =>
            L.td({
              $$: () => (typeof cell == 'object' ? cell.v : cell),
              _contenteditable: 'true',
              _dataPos: () => i + ',' + j,
              _dataVisualPos: () => i + ',' + mergeManager.getVisualCol(i, j),
              _style: () => (cell.bc ? 'background-color:' + cell.bc : '') + (cell.fc ? ';color:' + cell.fc : ''),
              _colspan: () => cell.cs,
              _rowspan: () => cell.rs,
              _class: () => {
                var pos1 = mergeManager.getVisualCol(i, j)
                var inX = between(pos1, S.selected.left, S.selected.width)
                var inY = between(i, S.selected.top, S.selected.height)
                var results = []
                if (inX && inY) results.push('selected')
                if (inX && i == S.selected.top) results.push('selected-top')
                if (inY && pos1 == S.selected.left) results.push('selected-left')
                if (inX && i + (cell.rs || 1) - 1 == S.selected.top + S.selected.height - 1)
                  results.push('selected-bottom')
                if (inY && pos1 == S.selected.left + S.selected.width - (cell.cs || 1)) results.push('selected-right')
                return results.join(' ')
              },
            })
          ),
        })
      )
    },
    oninput: function (e) {
      var pos = e.target.dataset.pos.split(',')
      L._abortDep = true
      if (typeof S.table[pos[0]][pos[1]] == 'string') S.table[pos[0]][pos[1]] = e.target.textContent
      else S.table[pos[0]][pos[1]].v = e.target.textContent
      L._abortDep = false
    },
    onmousedown: function (e) {
      selecting = true
      selectStart = e.target.dataset.visualPos.split(',').map(Number)
    },
    onmousemove: (e) => handleSelect(e),
    onmouseup: (e) => handleSelect(e, true),
    onpaste: function (e) {
      var tmp = e.clipboardData.getData('text/html'),
        p = new DOMParser(),
        d = p.parseFromString(tmp, 'text/html'),
        pasted = d && d.querySelector('table'),
        trs = [...((pasted && pasted.querySelectorAll('tr')) || [])]
      mergeManager.fill(
        S.selected.top,
        S.selected.left,
        trs.map((tr) => [...(tr.querySelectorAll('td') || [])]),
        S.table
      )
    },
  }),
  ondragover: (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  },
  ondrop: (e) => {
    e.preventDefault()
    openFile(e.dataTransfer.files[0])
  },
  colorPicker: {
    $class: { hidden: () => !S.colorPickerVisible },
    close: toolButton('x', () => (S.colorPickerVisible = false)),
    colors: [
      ['#ffaaaa', '#ffffaa', '#aaffaa', '#aaffff', '#aaaaff', '#ffffff'],
      ['#ff5555', '#ffff55', '#55ff55', '#55ffff', '#5555ff', '#cccccc'],
      ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#999999'],
      ['#aa0000', '#aaaa00', '#00aa00', '#00aaaa', '#0000aa', '#666666'],
      ['#550000', '#555500', '#005500', '#005555', '#000055', '#333333'],
      ['#220000', '#222200', '#002200', '#002222', '#000022', '#000000', 'transparent'],
    ].map((row) => ({
      $$: row.map((cell) => ({
        _style: 'background-color:' + cell,
        onclick: (e) => {
          S.colorPickerVisible = false
          resolveColor(cell)
        },
      })),
    })),
  },
})
