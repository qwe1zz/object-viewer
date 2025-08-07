// js/jspage1.js

(function($) {
    window.App = DataManager.loadAllAppData();
    let clipboardNode = null; // 공용 클립보드

    function formatValue(value, key) {
        if (value === null || value === undefined || String(value).trim() === '') return '';
        const num = Number(String(value).replace(/,/g, ''));
        if (isNaN(num)) return value;

        if (key === '단가') {
            return num.toLocaleString('en-US');
        }
        return parseFloat(num.toFixed(2)).toString(); // .00 제거를 위해 parseFloat 후 toString
    }

    function TreeEditor(type, initialData) {
      let treeArr = initialData || [];
      let attrHeaders = [];
      let headerMap = {};
      let uidSeq = Math.max(0, ...flattenTreeArr(treeArr).map(n => parseInt(n.uid.replace(/[^0-9]/g, ''), 10) || 0)) + 1;
      let prefix = type === 'obj' ? 'obj' : 'task';

      if (type === 'task') {
        attrHeaders = [
            '계층', '작업구분', '상위작업명', '작업명', '규격', 
            '작업분류', '1인생산성', '필수공기', '단위', '단가', '강수영향', '기온영향', 
            '자재영향', '자재명', '자재수량', '장비영향', '장비명', '장비수량'
        ];
      }
      
      const fileInput = document.getElementById(prefix+'ExcelFile');
      fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(evt) {
          try {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, {type:'array'});
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            let rows = XLSX.utils.sheet_to_json(sheet, {defval:'', header:1});
            if(rows.length<2) return alert('엑셀 데이터 부족!');
            
            const headerRow = rows[0].map(h=>String(h).replace(/\r?\n|\r/g, '').replace(/\s+/g, ' ').trim());
            headerMap = {}; headerRow.forEach((h,i)=>{ headerMap[h.trim().replace(/\s+/g,'').toLowerCase()] = i; });

            if (type === 'obj') {
                attrHeaders = headerRow.filter(h => h.trim() !== '객체코드');
            }
            
            rows = rows.slice(1);
            uidSeq = 1;
            treeArr = buildTreeArrFromRows(rows, headerRow);
            
            if(type === 'obj') {
              window.App.objTreeArr = treeArr;
              DataManager.save('objTreeArr', window.App.objTreeArr);
            } else {
              window.App.taskTreeArr = treeArr;
              DataManager.save('taskTreeArr', window.App.taskTreeArr);
            }
            renderJsTree(treeArr);
            renderTable(treeArr, attrHeaders);
          } catch (error) {
            console.error("Error processing " + prefix + " file:", error);
            alert(prefix.toUpperCase() + " 엑셀 파일을 처리하는 중 오류가 발생했습니다.");
          } finally {
            e.target.value = '';
          }
        };
        reader.readAsArrayBuffer(file);
      });

      function buildTreeArrFromRows(rows, originalHeaders) {
        uidSeq = 1;
        if(type === 'obj') {
          let nodes = [], nodeList = [], root = [];
          rows.forEach(row=>{
            let attr = {};
            originalHeaders.forEach((h)=>{
              let idx = headerMap[h.trim().replace(/\s+/g,'').toLowerCase()];
              if(idx !== undefined && row[idx]!==undefined) attr[h]=row[idx];
            });
            let n = { name: attr['객체명'], _attr: attr, children: [], uid: `${prefix}${uidSeq++}` };
            nodeList.push(n);
            nodes.push({ name:n.name, parent:attr['상위객체명']||'', node:n });
          });
          nodes.forEach(item=>{
              if(!item.parent || item.parent==="null") {
                  root.push(item.node);
              } else {
                let parent = nodeList.slice().reverse().find(n=>n.name===item.parent);
                if(parent) {
                    parent.children.push(item.node);
                } else {
                  let virtualRoot = root.find(n => n.name === item.parent);
                  if(!virtualRoot){
                    virtualRoot = { name: item.parent, _attr: { "객체명": item.parent }, children: [], uid: `${prefix}${uidSeq++}` };
                    root.push(virtualRoot);
                  }
                  virtualRoot.children.push(item.node);
                }
              }
            });
          return root;
        } else { // type === 'task'
          let allNodes = {}; let roots = [];
          rows.forEach(row => {
            let attr = {};
            originalHeaders.forEach((h) => {
              let idx = headerMap[h.trim().replace(/\s+/g,'').toLowerCase()];
              if (idx !== undefined && row[idx] !== undefined) attr[h] = row[idx];
            });
            let 작업구분 = attr['작업구분'] || '';
            let 상위작업명 = attr['상위작업명'] || '';
            let 작업명 = attr['작업명'] || '';
            if (!작업명) return;

            if (작업구분 && !allNodes['__root__' + 작업구분]) {
              allNodes['__root__' + 작업구분] = { name: 작업구분, _attr: { '작업명': 작업구분 }, children: [], uid: `${prefix}${uidSeq++}` };
              roots.push(allNodes['__root__' + 작업구분]);
            }
            let parentKey = 작업구분 + '__' + 상위작업명;
            if (상위작업명 && !allNodes[parentKey]) {
              allNodes[parentKey] = { name: 상위작업명, _attr: { '작업명': 상위작업명 }, children: [], uid: `${prefix}${uidSeq++}` };
              if (allNodes['__root__' + 작업구분]) {
                  allNodes['__root__' + 작업구분].children.push(allNodes[parentKey]);
              } else {
                  roots.push(allNodes[parentKey]);
              }
            }
            let taskNode = { name: 작업명, _attr: attr, children: [], uid: `${prefix}${uidSeq++}` };
            if (상위작업명 && allNodes[parentKey]) {
                allNodes[parentKey].children.push(taskNode);
            } else if (작업구분 && allNodes['__root__' + 작업구분]) {
                allNodes['__root__' + 작업구분].children.push(taskNode);
            } else {
                roots.push(taskNode);
            }
          });
          return roots;
        }
      }
      
      function getParentByUid(uid, arr=treeArr, parent=null) {
        for(let node of arr) {
          if(node.uid === uid) return parent;
          if (node.children) {
            let found = getParentByUid(uid, node.children, node);
            if(found) return found;
          }
        }
        return null;
      }
      function toJsTreeArr(arr) {
        return arr.map(node=>({
          id: node.uid, text: node.name, children: toJsTreeArr(node.children || [])
        }));
      }
    function renderJsTree(tree) {
      let treeId = '#' + prefix + 'JsTree';
      $(treeId).jstree('destroy');
      $(treeId).jstree({
        core: { check_callback: true, themes: { dots: false }, data: toJsTreeArr(tree) },
        plugins: ["dnd", "contextmenu", "search", "checkbox"],
        checkbox: { three_state: false, cascade: "none", whole_node: false },
        contextmenu: {
          items: function (node) {
            return {
              copy: {
                label: "복사",
                action: function () {
                  const selectedIds = $(treeId).jstree(true).get_selected();
                  if (selectedIds.length === 0) return;
                  clipboardNode = selectedIds.map(uid => JSON.parse(JSON.stringify(getNodeByUid(uid, treeArr))));
                  alert(clipboardNode.length + '개 항목 복사됨');
                }
              },
              paste: {
                label: "붙여넣기",
                action: function () {
                  if (!clipboardNode) return alert('복사된 내용이 없습니다.');
                  const parentNode = getNodeByUid(node.id, treeArr);
                  if (!parentNode) return;

                  clipboardNode.forEach(cNode => {
                      const newNode = JSON.parse(JSON.stringify(cNode));
                      const reuid = (n) => {
                          n.uid = `${prefix}${uidSeq++}`;
                          if (n.children) n.children.forEach(reuid);
                      };
                      reuid(newNode);
                      updateParentNameRecursive(newNode, parentNode.name);
                      parentNode.children.push(newNode);
                  });
                  
                  DataManager.save(type === 'obj' ? 'objTreeArr' : 'taskTreeArr', treeArr);
                  renderJsTree(treeArr);
                  renderTable(treeArr, attrHeaders);
                }
              },
              create: { label: "하위 추가", action: function () { addNode(node.id); }},
              rename: { label: "명칭변경", action: function () { $(treeId).jstree(true).edit(node); }},
              delete: { label: "삭제", action: function () {
                  const ids = $(treeId).jstree(true).get_selected();
                  ids.forEach(uid => {
                    const parent = getParentByUid(uid, treeArr);
                    if (parent) parent.children = parent.children.filter(n => n.uid !== uid);
                    else treeArr = treeArr.filter(n => n.uid !== uid);
                  });
                  DataManager.save(type === 'obj' ? 'objTreeArr' : 'taskTreeArr', treeArr);
                  renderJsTree(treeArr); renderTable(treeArr, attrHeaders);
              }}
            };
          }
        }
      })
      .on("select_node.jstree", function (e, data) {
        highlightRow(data.node.id);
        scrollToRow(data.node.id);
      })
      .on('move_node.jstree', function (e, data) {
        let node = getNodeByUid(data.node.id, treeArr);
        let oldParent = getParentByUid(node.uid, treeArr);
        if (oldParent) oldParent.children = oldParent.children.filter(n => n.uid !== node.uid);
        else treeArr = treeArr.filter(n => n.uid !== node.uid);
        let newParent = data.parent === "#" ? null : getNodeByUid(data.parent, treeArr);
        if (newParent) newParent.children.splice(data.position, 0, node);
        else treeArr.splice(data.position, 0, node);
        updateParentNameRecursive(node, newParent ? newParent.name : '');
        DataManager.save(type === 'obj' ? 'objTreeArr' : 'taskTreeArr', treeArr);
        renderTable(treeArr, attrHeaders);
      })
      .on("rename_node.jstree", function (e, data) {
        let node = getNodeByUid(data.node.id, treeArr);
        node.name = data.text;
        node._attr[type === 'obj' ? '객체명' : '작업명'] = data.text;
        if (node.children) {
            node.children.forEach(child => updateParentNameRecursive(child, node.name));
        }
        DataManager.save(type === 'obj' ? 'objTreeArr' : 'taskTreeArr', treeArr);
        renderTable(treeArr, attrHeaders);
      })
      .on('ready.jstree', function () { $(treeId).jstree("open_all"); });
    }

    function getDynamicLinkedTaskHeaders(tree) {
        const baseHeaders = ['객체명', '고유객체명', '상위고유객체명', '상위객체명', '목적시설물', '선행객체', '모델파일명', '형상정보ID', '모델형태'];
        const flatRows = flattenTreeArr(tree);
        
        let maxLinkedTasks = 0;
        let maxTaskAttributes = 0;

        flatRows.forEach(row => {
            const linkedTasks = row.node._attr.linkedTasks || [];
            maxLinkedTasks = Math.max(maxLinkedTasks, linkedTasks.length);
            
            linkedTasks.forEach(task => {
                const attrCount = (task['작업명']?.split('_').length || 1) - 1;
                maxTaskAttributes = Math.max(maxTaskAttributes, attrCount);
            });
        });

        const finalHeaders = [...baseHeaders];
        
        for (let i = 1; i <= maxLinkedTasks; i++) {
            finalHeaders.push(`연결작업${i}작업명`);
            for (let j = 1; j <= maxTaskAttributes; j++) {
                finalHeaders.push(`연결작업${i}작업속성${j}`);
            }
            finalHeaders.push(`연결작업${i}작업수량`);
            finalHeaders.push(`연결작업${i}단위`);
        }
        
        return finalHeaders;
    }

    function renderTable(tree, headers){
        const objWideHeaders = ['객체명', '고유객체명', '상위고유객체명', '상위객체명', '목적시설물', '선행객체'];
        const taskWideHeaders = ['작업구분', '상위작업명', '작업명', '규격', '작업분류'];

        let panelId = "#"+prefix+"AttrTableWrap";
        let html = '<table>';

        if (type === 'obj') {
            const finalHeaders = getDynamicLinkedTaskHeaders(tree);
            attrHeaders = finalHeaders; 
            html += `<thead><tr><th>계층</th>`;
            finalHeaders.forEach(h => { 
                const isWide = objWideHeaders.includes(h) || h.endsWith('작업명');
                html += `<th ${isWide ? 'class="wide-col"' : ''}>${h}</th>`;
            });
            html += '</tr></thead><tbody>';

            let flatRows = flattenTreeArr(tree);
            flatRows.forEach(row => {
                const isSelected = $('#' + prefix + 'JsTree').jstree(true).is_selected(row.uid);
                html += `<tr data-uid="${row.uid}" class="tree-row${isSelected ? ' selected':''}">`;
                html += `<td style="text-align:left; padding-left:${row.level*20+5}px;">${row.name||''}</td>`;
                
                const linkedTasks = row.node._attr.linkedTasks || [];

                finalHeaders.forEach(h => {
                    let val = '';
                    let isReadOnly = false;
                    let alignStyle = 'text-align: center;';

                    if (h.startsWith('연결작업')) {
                        const match = h.match(/^연결작업(\d+)(.+)$/);
                        if (match) {
                            const taskIndex = parseInt(match[1], 10) - 1;
                            const key = match[2];
                            const task = linkedTasks[taskIndex];

                            if (task) {
                                if (key.startsWith('작업속성')) {
                                    isReadOnly = true; // 작업속성은 작업명에 따라 자동 계산되므로 읽기전용
                                    const attrIndex = parseInt(key.replace('작업속성', ''), 10);
                                    val = task['작업명']?.split('_')[attrIndex] || '';
                                } else {
                                    val = task[key] || '';
                                }
                            }
                        }
                    } else {
                        val = formatValue(row.node._attr[h], h);
                    }
                    html += `<td><input type="text" style="${alignStyle}" value="${val}" data-key="${h}" data-uid="${row.uid}" ${isReadOnly ? 'readonly style="background:#eee;"' : ''}></td>`;
                });
                html += '</tr>';
            });

        } else { // For 'task' type
            let flatRows = flattenTreeArr(tree);
            html += '<thead><tr>';
            headers.forEach(h => {
                const isWide = taskWideHeaders.includes(h);
                html += `<th ${isWide ? 'class="wide-col"' : ''}>${h}</th>`;
            });
            html += '</tr></thead><tbody>';

            flatRows.forEach(row => {
              const isSelected = $('#' + prefix + 'JsTree').jstree(true).is_selected(row.uid);
              html += `<tr data-uid="${row.uid}" class="tree-row${isSelected ? ' selected':''}">`;
              
              headers.forEach(h => {
                  let val = '';
                  let isReadOnly = false;
                  let alignStyle = 'text-align: center;';

                  if (h === '계층') {
                      html += `<td style="text-align:left; padding-left:${row.level*20+5}px;">${row.name||''}</td>`;
                      return;
                  }
                  
                  if (h === '작업분류') {
                      const unitValue = row.node._attr['단위'] || "";
                      val = unitValue ? "기성작업" : "상위작업";
                      isReadOnly = true;
                  } else {
                      val = formatValue(row.node._attr[h], h);
                  }
                  
                  html += `<td><input type="text" style="${alignStyle}" value="${val}" data-key="${h}" data-uid="${row.uid}" ${isReadOnly ? 'readonly style="background:#eee;"' : ''}></td>`;
              });
              html += '</tr>';
            });
        }
        
        html += '</tbody></table>';
        $(panelId).html(html);
        bindTableEvents();
      }

      function bindTableEvents(){
        let panelId = "#"+prefix+"AttrTableWrap";
        $(panelId+' td input[type="text"]').on('focus', function(){
            const uid = $(this).data('uid');
            $('#' + prefix + 'JsTree').jstree(true).deselect_all();
            $('#' + prefix + 'JsTree').jstree(true).select_node(uid);
        });

        $(panelId+' td input[type="text"]').on('input', function(){
          const uid = $(this).data('uid');
          const key = $(this).data('key');
          const value = this.value;
          let node = getNodeByUid(uid, treeArr);
          
          if(!node) return;

          if (type === 'obj' && key.startsWith('연결작업')) {
              const match = key.match(/^연결작업(\d+)(.+)$/);
              if (match) {
                  const taskIndex = parseInt(match[1], 10) - 1;
                  const propName = match[2];

                  if (node._attr.linkedTasks && node._attr.linkedTasks[taskIndex]) {
                      if (!propName.startsWith('작업속성')) {
                          node._attr.linkedTasks[taskIndex][propName] = value;
                      }
                  }
              }
          } else {
              node._attr[key] = value;
          }

          DataManager.save(type === 'obj' ? 'objTreeArr' : 'taskTreeArr', treeArr);

          if (type === 'task' && key === '단위') {
              renderTable(treeArr, attrHeaders);
          }
          if (type === 'obj' && key.endsWith('작업명')) {
              renderTable(treeArr, []);
          }
        });

        $(panelId+' tbody tr').on('click', function(event){
            const uid = $(this).data('uid');
            const treeInstance = $('#' + prefix + 'JsTree').jstree(true);
            if (event.ctrlKey || event.metaKey) {
                treeInstance.toggle_node(uid);
            } else { 
                treeInstance.deselect_all(); 
                treeInstance.select_node(uid); 
            }
        });
      }
      function highlightRow(uid){
        let panelId = '#'+prefix+'AttrTableWrap';
        $(panelId+' tbody tr').removeClass('selected');
        $('#' + prefix + 'JsTree').jstree(true).get_selected().forEach(node_id => {
            $(panelId+' tbody tr[data-uid="'+node_id+'"]').addClass('selected');
        });
      }
      function scrollToRow(uid){
        let tr = document.querySelector('#'+prefix+'AttrTableWrap tbody tr[data-uid="'+uid+'"]');
        if(tr) tr.scrollIntoView({behavior:'smooth',block:'center'});
      }
      
    function updateParentNameRecursive(node, parentName) {
      if(node._attr) node._attr[type === 'obj' ? '상위객체명' : '상위작업명'] = parentName || '';
      if (node.children) {
        node.children.forEach(child => updateParentNameRecursive(child, node.name));
      }
    }
    function addNode(parentUid){
        const name = prompt("추가할 "+(type==='obj'?"객체의 이름":"작업명")+"?");
        if(!name) return;
        let parent = getNodeByUid(parentUid, treeArr);
        let n = { name: name, _attr: { [type==='obj'?'객체명':'작업명']: name }, children: [], uid: `${prefix}${uidSeq++}` };
        n._attr[type === 'obj' ? '상위객체명' : '상위작업명'] = parent.name;
        parent.children.push(n);
        DataManager.save(type === 'obj' ? 'objTreeArr' : 'taskTreeArr', treeArr);
        renderJsTree(treeArr); renderTable(treeArr, attrHeaders);
      }
      if(type === 'obj'){
        document.getElementById('btnObjAutoId').onclick = function() {
          let nameCount = {};
          function fillUniqueAttrs(nodes, parentAttr) {
            nodes.forEach(child=>{
              const name = child._attr['객체명'] || '';
              nameCount[name] = (nameCount[name] || 0) + 1;
              child._attr['고유객체명'] = `${name}#${nameCount[name].toString().padStart(2, '0')}`;
              child._attr['상위고유객체명'] = parentAttr?.['고유객체명'] || '';
              if (child.children) {
                fillUniqueAttrs(child.children, child._attr);
              }
            });
          }
          nameCount = {};
          fillUniqueAttrs(treeArr, null);
          DataManager.save('objTreeArr', treeArr);
          renderTable(treeArr, attrHeaders);
          alert("🏷 고유객체명/⬆ 상위객체 필드 자동 입력 완료!");
        };
      }

      if (type === 'task') {
        document.getElementById('btnTaskSetHierarchy').onclick = function() {
          function updateChildrenHierarchy(children, divisionName, parentName) {
            children.forEach(child => {
              if (!child._attr) child._attr = {};
              child._attr['작업구분'] = divisionName;
              child._attr['상위작업명'] = parentName;
              if (child.children && child.children.length > 0) {
                updateChildrenHierarchy(child.children, divisionName, child.name);
              }
            });
          }

          treeArr.forEach(divisionNode => {
            if (!divisionNode._attr) divisionNode._attr = {};
            divisionNode._attr['작업구분'] = divisionNode.name;
            divisionNode._attr['상위작업명'] = '';
            if (divisionNode.children && divisionNode.children.length > 0) {
              updateChildrenHierarchy(divisionNode.children, divisionNode.name, divisionNode.name);
            }
          });

          DataManager.save('taskTreeArr', treeArr);
          renderTable(treeArr, attrHeaders);
          alert("📂 작업구분 및 상위작업명이 트리 구조에 따라 설정되었습니다.");
        };
      }

      document.getElementById('btn'+(type==='obj'?'Obj':'Task')+'ExportJson').onclick = function(){
        function arrToNestedDict(arr) {
          let obj = {};
          arr.forEach(node=>{
            let data = { _attr: {...node._attr}, ...arrToNestedDict(node.children || []) };
            obj[node.name || `node_${node.uid}`] = data;
          });
          return obj;
        }
        const blob = new Blob([JSON.stringify(arrToNestedDict(treeArr), null, 2)], {type:'application/json'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (type==='obj'?'object_tree.json':'task_tree.json');
        a.click(); URL.revokeObjectURL(a.href);
      };
      
      document.getElementById('btn'+(type==='obj'?'Obj':'Task')+'ExportExcel').onclick = function(){
        let flatNodes = flattenTreeArr(treeArr);
        let headersToExport;
        
        if (type === 'obj') {
            headersToExport = getDynamicLinkedTaskHeaders(treeArr);
        } else {
            headersToExport = attrHeaders;
        }

        let rowsToExport = [headersToExport];
        flatNodes.forEach(flatNode => {
            let row = headersToExport.map(header => {
                if (header === '계층') {
                    return " ".repeat(flatNode.level * 4) + (flatNode.name || '');
                }
                if (type === 'task' && header === '작업분류') {
                    const unitValue = flatNode.node._attr['단위'] || "";
                    return unitValue ? "기성작업" : "상위작업";
                }
                if (type === 'obj' && header.startsWith('연결작업')) {
                    const linkedTasks = flatNode.node._attr.linkedTasks || [];
                    const match = header.match(/^연결작업(\d+)(.+)$/);
                    if (match) {
                        const taskIndex = parseInt(match[1], 10) - 1;
                        const key = match[2];
                        const task = linkedTasks[taskIndex];
                        if (task) {
                            if (key.startsWith('작업속성')) {
                                const attrIndex = parseInt(key.replace('작업속성', ''), 10);
                                return task['작업명']?.split('_')[attrIndex] || '';
                            }
                            return task[key] || '';
                        }
                    }
                    return '';
                }
                return formatValue(flatNode.node._attr[header], header);
            });
            rowsToExport.push(row);
        });

        let ws = XLSX.utils.aoa_to_sheet(rowsToExport);
        let wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, (type === 'obj' ? '객체속성' : '작업속성'));
        XLSX.writeFile(wb, (type === 'obj' ? 'object_tree.xlsx' : 'task_tree.xlsx'));
    };
      $('#'+prefix+'TreeSearch').on('keyup', function(){ $('#'+prefix+'JsTree').jstree('search', $(this).val().trim()); });
      
      renderJsTree(treeArr);
      renderTable(treeArr, attrHeaders);
    }

    $('#btnSetPurpose').on('click', function () {
      const objIds = $('#objJsTree').jstree(true).get_selected();
      if (!objIds || objIds.length === 0) return alert("먼저 트리에서 목적시설물로 지정할 객체를 선택하세요.");
      
      const setPurposeRecursively = (node, purposeName) => {
        if (node._attr) node._attr['목적시설물'] = purposeName;
        if (node.children) {
            node.children.forEach(child => setPurposeRecursively(child, purposeName));
        }
      };
      objIds.forEach(uid => {
        const node = getNodeByUid(uid, window.App.objTreeArr);
        if (node?._attr) setPurposeRecursively(node, node._attr['고유객체명'] || '');
      });
      DataManager.save('objTreeArr', window.App.objTreeArr);
      TreeEditor('obj', window.App.objTreeArr);
      alert("🎯 선택된 모든 객체 기준으로 각각 목적시설물이 설정되었습니다!");
    });

    $('#btnSetPredecessor').on('click', function () {
      const purposeGroups = {};
      function traverseAndGroup(node) {
        if (node._attr?.['목적시설물'] && node.children.length > 0) {
          const key = node._attr['목적시설물'];
          (purposeGroups[key] = purposeGroups[key] || []).push(node);
        }
        if (node.children) {
            node.children.forEach(traverseAndGroup);
        }
      }
      window.App.objTreeArr.forEach(root => traverseAndGroup(root));
      
      Object.values(purposeGroups).forEach(nodes => {
        for (let i = 0; i < nodes.length; i++) {
          if (!nodes[i]._attr) continue;
          nodes[i]._attr['선행객체'] = (i === 0) ? nodes[i]._attr['목적시설물'] : nodes[i - 1]._attr?.['고유객체명'] || '';
        }
      });

      const taskLinkedObjectsByPurpose = {};
      const flatTree = flattenTreeArr(window.App.objTreeArr);

      flatTree.forEach(({ node }) => {
        const purpose = node._attr?.['목적시설물'];
        const hasLinkedTasks = node._attr?.linkedTasks && node._attr.linkedTasks.length > 0;

        if (purpose && hasLinkedTasks) {
          if (!taskLinkedObjectsByPurpose[purpose]) {
            taskLinkedObjectsByPurpose[purpose] = [];
          }
          taskLinkedObjectsByPurpose[purpose].push(node);
        }
      });

      Object.values(taskLinkedObjectsByPurpose).forEach(nodesInSequence => {
        for (let i = 1; i < nodesInSequence.length; i++) { 
          const currentNode = nodesInSequence[i];
          const previousNode = nodesInSequence[i - 1];
          
          if (currentNode._attr && previousNode._attr) {
            currentNode._attr['선행객체'] = previousNode._attr['고유객체명'] || '';
          }
        }
      });

      DataManager.save('objTreeArr', window.App.objTreeArr);
      TreeEditor('obj', window.App.objTreeArr);
      alert("✅ 목적시설물별 중간노드 및 작업연결 객체의 선행객체가 트리 순서에 따라 자동 지정되었습니다.");
    });

    // [신규] 객체 & 작업 연결 해제 버튼 이벤트 핸들러
    $('#btnObjTaskUnlink').on('click', function() {
        const selectedObjIds = $('#objJsTree').jstree(true).get_selected();

        if (selectedObjIds.length === 0) {
            return alert("연결을 해제할 객체를 트리에서 선택하세요.");
        }

        if (!confirm(`${selectedObjIds.length}개 객체에 연결된 모든 작업 정보를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) {
            return;
        }

        const objNodes = selectedObjIds.map(id => getNodeByUid(id, window.App.objTreeArr)).filter(Boolean);

        let unlinkCount = 0;
        objNodes.forEach(objNode => {
            if (objNode._attr && objNode._attr.linkedTasks && objNode._attr.linkedTasks.length > 0) {
                objNode._attr.linkedTasks = []; // 연결된 작업 배열을 비웁니다.
                unlinkCount++;
            }
        });

        if (unlinkCount > 0) {
            DataManager.save('objTreeArr', window.App.objTreeArr);
            TreeEditor('obj', window.App.objTreeArr); // 변경된 데이터로 객체 테이블 다시 렌더링
            alert(`✅ ${unlinkCount}개 객체의 작업 연결이 성공적으로 해제되었습니다.`);
        } else {
            alert("선택된 객체 중에 연결된 작업이 있는 객체가 없습니다.");
        }
    });

    let currentObjNodes = [];
    let currentTaskNodes = [];

    function openTaskOrderModal(objNodes, taskNodes) {
        currentObjNodes = objNodes;
        currentTaskNodes = taskNodes;
        const $list = $('#sortable-task-list');
        $list.empty();

        taskNodes.forEach(taskNode => {
            if (taskNode._attr['단위']) {
                const li = `<li data-uid="${taskNode.uid}">${taskNode.name}</li>`;
                $list.append(li);
            }
        });

        if ($list.children().length > 0) {
            $list.sortable();
            $('#task-order-modal').css('display', 'flex');
        } else {
            alert("연결할 수 있는 기성 작업이 없습니다. (상위 작업은 연결되지 않습니다)");
        }
    }

    function closeTaskOrderModal() {
        $('#task-order-modal').hide();
        $('#sortable-task-list').empty().sortable('destroy');
        currentObjNodes = [];
        currentTaskNodes = [];
    }

    $('#btnObjTaskLink').on('click', function() {
        const selectedObjIds = $('#objJsTree').jstree(true).get_selected();
        const selectedTaskIds = $('#taskJsTree').jstree(true).get_selected();

        if (selectedObjIds.length === 0 || selectedTaskIds.length === 0) {
            return alert("객체와 작업 트리에서 연결할 항목을 각각 1개 이상 선택하세요.");
        }
        
        const taskNodes = selectedTaskIds.map(id => getNodeByUid(id, window.App.taskTreeArr)).filter(Boolean);
        const objNodes = selectedObjIds.map(id => getNodeByUid(id, window.App.objTreeArr)).filter(Boolean);
        
        if (objNodes.length === 0 || taskNodes.length === 0) {
            return alert("유효한 객체 또는 작업을 찾을 수 없습니다.");
        }

        openTaskOrderModal(objNodes, taskNodes);
    });

    $('#btn-task-order-confirm').on('click', function() {
        const orderedTaskUids = $('#sortable-task-list li').map(function() {
            return $(this).data('uid');
        }).get();

        const orderedTaskNodes = orderedTaskUids.map(uid => getNodeByUid(uid, window.App.taskTreeArr));

        currentObjNodes.forEach(objNode => {
            if (!objNode._attr) objNode._attr = {};
            if (!objNode._attr.linkedTasks) objNode._attr.linkedTasks = [];

            orderedTaskNodes.forEach(taskNode => {
                if (objNode._attr.linkedTasks.some(t => t['작업명'] === taskNode._attr['작업명'])) {
                    return;
                }
                
                const taskInfo = {
                    '작업명': taskNode._attr['작업명'] || '',
                    '단위': taskNode._attr['단위'] || '',
                    '작업수량': objNode._attr['작업수량'] || ''
                };
                objNode._attr.linkedTasks.push(taskInfo);
            });
        });

        DataManager.save('objTreeArr', window.App.objTreeArr);
        TreeEditor('obj', window.App.objTreeArr);
        alert(`✅ ${currentObjNodes.length}개의 객체에 ${orderedTaskNodes.length}개의 작업이 순서대로 연결/추가되었습니다.`);
        closeTaskOrderModal();
    });

    $('#btn-task-order-cancel, #task-order-modal').on('click', function(e) {
        if (e.target === this) {
            closeTaskOrderModal();
        }
    });
    $('.modal-content').on('click', function(e) {
        e.stopPropagation();
    });

    $('#btnObjSelectAll').on('click', () => $('#objJsTree').jstree(true).select_all());
    $('#btnObjDeselectAll').on('click', () => $('#objJsTree').jstree(true).deselect_all());
    $('#btnTaskSelectAll').on('click', () => $('#taskJsTree').jstree(true).select_all());
    $('#btnTaskDeselectAll').on('click', () => $('#taskJsTree').jstree(true).deselect_all());

    $(document).ready(function() {
        TreeEditor('obj', window.App.objTreeArr);
        TreeEditor('task', window.App.taskTreeArr);
    });

})(jQuery);