import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
(function($) {
    // --- 전역 변수 선언 ---
    let App; // App 데이터 객체
    let scene, camera, renderer, controls;
    let highlightedObjects = [];
    const defaultMaterial = new THREE.MeshLambertMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
    const highlightMaterial = new THREE.MeshLambertMaterial({ color: 0xffc107, emissive: 0x555500, side: THREE.DoubleSide });
    const uploadedModels = {};
    let objectModelMap = {};
    let objectVisibilityState = {};

    /**
     * 날짜 객체를 'YYYY-MM-DD' 형식의 문자열로 변환하는 함수.
     * toISOString()의 UTC 변환 문제를 피하기 위해 추가되었습니다.
     * @param {Date} date - 변환할 날짜 객체
     * @returns {string} 'YYYY-MM-DD' 형식의 문자열
     */
    function formatDateToYYYYMMDD(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // --- 3D 뷰어 초기화 및 제어 함수 ---
    function initThreeJSViewer() {
        const container = document.getElementById('viewer-container');
        if (!container || renderer) return;
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x333a44);
        camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000000);
        camera.position.set(100, 100, 100);
        
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(renderer.domElement);
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
        directionalLight.position.set(15, 20, 10);
        scene.add(directionalLight);
        const animate = () => {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();
        window.addEventListener('resize', () => {
            if (!renderer || !camera) return;
            const cont = document.getElementById('viewer-container');
            if(cont.clientWidth > 0 && cont.clientHeight > 0) {
                camera.aspect = cont.clientWidth / cont.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(cont.clientWidth, cont.clientHeight);
            }
        }, false);
        setupDragAndDrop(container);
    }
    function setupDragAndDrop(container) {
        container.addEventListener('dragover', (event) => {
            event.preventDefault();
            container.style.backgroundColor = '#444a54';
        });
        container.addEventListener('dragleave', () => {
            container.style.backgroundColor = '#333a44';
        });
        container.addEventListener('drop', (event) => {
            event.preventDefault();
            container.style.backgroundColor = '#333a44';
            $('#drag-drop-guide').hide();
            handleFiles(event.dataTransfer.files);
        });
    }
    window.handleFiles = function(files) {
        const fileList = Array.from(files);
        const objFiles = fileList.filter(f => f.name.toLowerCase().endsWith('.obj'));
        const mtlFiles = fileList.filter(f => f.name.toLowerCase().endsWith('.mtl'));
        
        const mtlPromises = mtlFiles.map(file => new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = e => resolve({ name: file.name, content: e.target.result });
            reader.readAsText(file);
        }));
        Promise.all(mtlPromises).then(mtlData => {
            const mtlLoader = new MTLLoader();
            const objLoader = new OBJLoader();
            const loadPromises = [];
            objFiles.forEach(objFile => {
                const promise = new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        try {
                            const mtlFileName = objFile.name.replace(/\.obj$/i, '.mtl');
                            const correspondingMtl = mtlData.find(m => m.name.toLowerCase() === mtlFileName.toLowerCase());
                            if (correspondingMtl) {
                                const materials = mtlLoader.parse(correspondingMtl.content);
                                materials.preload();
                                objLoader.setMaterials(materials);
                            }
                            
                            const object = objLoader.parse(e.target.result);
                            object.name = objFile.name;
                            
                            if (uploadedModels[object.name]) {
                                scene.remove(uploadedModels[object.name]);
                            }
                            uploadedModels[object.name] = object;
                            scene.add(object);
                            object.visible = false;
                            resolve(object);
                        } catch (error) {
                            reject(error);
                        }
                    };
                    reader.readAsText(objFile);
                });
                loadPromises.push(promise);
            });
            Promise.all(loadPromises).then(() => {
                alert(`${loadPromises.length}개의 OBJ 파일 세트가 로드되었습니다. 'OBJ 형상 자동연결' 버튼을 클릭하여 연결하세요.`);
            }).catch(error => {
                alert(`모델 로딩 중 오류가 발생했습니다. 콘솔을 확인하세요.`);
                console.error(error);
            });
        });
    }
    function focusOnObjects(objects) {
        if (!objects || objects.length === 0) return;
        const box = new THREE.Box3();
        objects.forEach(obj => { if (obj && obj.visible) box.expandByObject(obj); });
        if (box.isEmpty()) return;
        const center = new THREE.Vector3();
        box.getCenter(center);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.5;
        controls.target.copy(center);
        camera.position.copy(center);
        camera.position.z += cameraZ;
        controls.update();
    }
    function highlight3DObjects(uniqueName) {
        highlightedObjects.forEach(obj => obj.traverse(c => { 
            if (c.isMesh) { 
                c.material = c.originalMaterial || defaultMaterial; 
                delete c.originalMaterial; 
            } 
        }));
        highlightedObjects = [];
        if (!uniqueName) {
            renderer.render(scene, camera);
            return;
        }
        const modelsToHighlight = getDescendantModels(uniqueName);
        
        modelsToHighlight.forEach(fileName => {
            const obj = uploadedModels[fileName];
            if (obj && obj.visible) {
                obj.traverse(c => {
                    if (c.isMesh) {
                        if (!c.originalMaterial) c.originalMaterial = c.material;
                        c.material = highlightMaterial;
                    }
                });
                highlightedObjects.push(obj);
            }
        });
        renderer.render(scene, camera);
    }
    function toggleObjectVisibility(uniqueName, isVisible) {
        const modelsToToggle = getDescendantModels(uniqueName);
        modelsToToggle.forEach(fileName => {
            const obj = uploadedModels[fileName];
            if (obj) {
                obj.visible = isVisible;
            }
        });
        if (isVisible) {
            const visibleModels = modelsToToggle.map(name => uploadedModels[name]).filter(Boolean);
            if(visibleModels.length > 0) focusOnObjects(visibleModels);
        }
        renderer.render(scene, camera);
    }
    function getDescendantModels(uniqueNameToFind) {
        const startNode = window.flattenTreeArr(App.objTreeArr).find(f => f.node._attr['고유객체명'] === uniqueNameToFind)?.node;
        if (!startNode) return objectModelMap[uniqueNameToFind] || [];
        let models = new Set();
        const findRecursive = (node) => {
            const uname = node._attr['고유객체명'];
            if (uname && objectModelMap[uname]) {
                objectModelMap[uname].forEach(modelName => models.add(modelName));
            }
            if (node.children) {
                node.children.forEach(findRecursive);
            }
        };
        findRecursive(startNode);
        return [...models];
    }
    // --- UI 업데이트 함수 ---
    function updatePropertiesPanel(item) {
        const $wrap = $('#prop-table-wrap');
        if (!item) {
            $wrap.html('<p style="color:#888; text-align:center;">항목을 선택하면 속성 정보가 표시됩니다.</p>');
            return;
        }
        const props = {};
        const objNode = item.data;
        const linkedJobs = App.jobs.filter(j => j.uniqueName === objNode._attr['고유객체명']);
        props['객체명'] = objNode.name;
        props['고유객체명'] = objNode._attr['고유객체명'];
        props['상위고유객체명'] = objNode._attr['상위고유객체명'] || '없음';
        props['하위객체명'] = objNode.children.map(c => c._attr['고유객체명']).join(', ') || '없음';
        props['목적시설물'] = objNode._attr['목적시설물'] || '(미지정)';
        if (linkedJobs.length > 0) {
            props['위치'] = [...new Set(linkedJobs.map(j => j.location || 'N/A'))].join(', ');
            props['작업명'] = [...new Set(linkedJobs.map(j => j.taskName))].join(', ');
            props['규격'] = [...new Set(linkedJobs.map(j => j.spec))].join(', ');
            props['단위'] = [...new Set(linkedJobs.map(j => j.unitInfo))].join(', ');
            
            const totalQty = linkedJobs.reduce((sum, j) => sum + (Number(j.totalQty) || 0), 0);
            props['총 작업수량'] = formatNumber(totalQty);
            
            const totalCost = linkedJobs.reduce((sum, j) => sum + (j.totalQty * j.contractCost), 0);
            props['총 공사비'] = formatNumber(totalCost);
        } else {
            props['위치'] = 'N/A';
            props['작업명'] = 'N/A';
        }
        
        let html = '<table class="prop-table"><tbody>';
        for (const key in props) {
            html += `<tr><th>${key}</th><td>${props[key]}</td></tr>`;
        }
        html += '</tbody></table>';
        $wrap.html(html);
    }
    function renderGanttView() {
        const $ganttTableWrap = $('#gantt-table-wrap');
        const hasSchedule = App.jobs && App.jobs.length > 0 && App.jobs.some(j => j.startDate);
        if (!hasSchedule) {
            $ganttTableWrap.html('<p style="text-align:center; color:#888; margin-top:20px;">2페이지에서 JOB 생성 및 \'예정 공정표 생성\'을 먼저 실행해주세요.</p>');
            return;
        }
        const allDates = new Set(App.jobs.flatMap(j => j.dailyWork ? j.dailyWork.map(d => d.date) : []));
        if (allDates.size === 0) {
            $ganttTableWrap.html('<p style="text-align:center; color:#888; margin-top:20px;">공정표에 유효한 작업일이 없습니다.</p>');
            return;
        }
        const sortedDates = [...allDates].sort();
        const startDate = new Date(sortedDates[0] + 'T00:00:00');
        let endDate = new Date(sortedDates[sortedDates.length - 1] + 'T00:00:00');
        
        const dateArray = [];
        for (let dt = new Date(startDate); dt <= endDate; dt.setDate(dt.getDate() + 1)) {
            dateArray.push(new Date(dt));
        }

        const holidaySet = new Set((App.weatherData || []).filter(d => d.holiday === 'O').map(d => d.date));

        let yearHeader = `<tr class="gantt-header-row-0"><th class="col-check" rowspan="4">OBJ</th><th class="col-name" rowspan="4">고유객체명</th><th class="col-job" rowspan="4">JOB</th>`;
        let monthHeader = '<tr class="gantt-header-row-1">';
        let dayHeader = '<tr class="gantt-header-row-2">';
        let hourHeader = '<tr class="gantt-header-row-3">';
        
        const dateMap = new Map();
        dateArray.forEach(d => {
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            if (!dateMap.has(year)) dateMap.set(year, new Map());
            if (!dateMap.get(year).has(month)) dateMap.get(year).set(month, []);
            dateMap.get(year).get(month).push(d);
        });
        for (const [year, months] of dateMap.entries()) {
            let yearColspan = 0;
            for (const [month, days] of months.entries()) {
                yearColspan += days.length * 8;
                monthHeader += `<th colspan="${days.length * 8}">${month}월</th>`;
                days.forEach(d => {
                    const dateStr = formatDateToYYYYMMDD(d);
                    const isHoliday = holidaySet.has(dateStr);
                    const holidayClass = isHoliday ? ' holiday-header' : '';
                    dayHeader += `<th colspan="8" class="${holidayClass}">${d.getDate()}일</th>`;
                    for(let h = 0; h < 8; h++) { hourHeader += `<th>${h+1}</th>`; }
                });
            }
            yearHeader += `<th colspan="${yearColspan}">${year}년</th>`;
        }
        
        yearHeader += '</tr>'; monthHeader += '</tr>'; dayHeader += '</tr>'; hourHeader += '</tr>';
        
        let bodyHtml = '<tbody>';
        
        const buildGanttRowsRecursive = (nodes, level, holidaySet) => {
            let html = '';
            const sortedNodes = [...nodes].sort((a, b) => {
                const aJobs = getDescendantJobs(a);
                const bJobs = getDescendantJobs(b);
                if (aJobs.length === 0 && bJobs.length === 0) return 0;
                if (aJobs.length === 0) return 1;
                if (bJobs.length === 0) return -1;
                const aMinJobIndex = Math.min(...aJobs.map(j => App.jobs.indexOf(j)));
                const bMinJobIndex = Math.min(...bJobs.map(j => App.jobs.indexOf(j)));
                return aMinJobIndex - bMinJobIndex;
            });
            sortedNodes.forEach(objNode => {
                const uniqueName = objNode._attr['고유객체명'];
                const descendantJobs = getDescendantJobs(objNode);
                
                if (descendantJobs.length > 0) {
                    const isLinked = !!objectModelMap[uniqueName];
                    const isVisible = !!objectVisibilityState[uniqueName];
                    let indicatorClass = isLinked ? `linked ${isVisible ? 'on' : 'off'}` : 'unlinked';
                    
                    const sortedJobs = descendantJobs.sort((ja, jb) => App.jobs.indexOf(ja) - App.jobs.indexOf(jb));
                    const allJobNames = [...new Set(sortedJobs.map(j => `JOB${App.jobs.indexOf(j) + 1}`))].join(', ');
                    const displayName = objNode._attr['고유객체명']; 
                    html += `<tr class="gantt-row" data-type="object" data-unique-name="${uniqueName}">
                                <td class="col-check"><div class="status-indicator ${indicatorClass}" data-unique-name="${uniqueName}"></div></td>
                                <td class="col-name" style="padding-left:${level * 20 + 5}px;">${displayName}</td>
                                <td class="col-job" title="${allJobNames}">${allJobNames}</td>`;
                    
                    dateArray.forEach((d) => {
                        const dateStr = formatDateToYYYYMMDD(d);
                        const isHoliday = holidaySet.has(dateStr);
                        const holidayCellClass = isHoliday ? ' holiday-cell' : '';
                        
                        const workSegmentsToday = [];
                        descendantJobs.forEach(j => {
                            j.dailyWork?.forEach(dw => {
                                if (dw.date === dateStr && dw.segments) {
                                    workSegmentsToday.push(...dw.segments);
                                }
                            });
                        });
                        const busyHours = new Array(8).fill(false);
                        workSegmentsToday.forEach(segment => {
                            const startHour = Math.floor(segment.start);
                            const endHour = startHour + segment.duration; 
                            for (let h = startHour; h < endHour && h < 8; h++) {
                                busyHours[h] = true;
                            }
                        });
                        for (let h = 0; h < 8; h++) {
                            const cellClass = busyHours[h] ? 'gantt-hour-cell active' : 'gantt-hour-cell';
                            const dividerClass = h === 7 ? ' gantt-day-divider' : '';
                            html += `<td class="${cellClass}${dividerClass}${holidayCellClass}"></td>`;
                        }
                    });
                    html += `</tr>`;
                }
                if (objNode.children?.length > 0) {
                    html += buildGanttRowsRecursive(objNode.children, level + 1, holidaySet);
                }
            });
            return html;
        };
        bodyHtml += buildGanttRowsRecursive(App.objTreeArr, 0, holidaySet);
        $ganttTableWrap.html(`<table><thead>${yearHeader}${monthHeader}${dayHeader}${hourHeader}</thead><tbody>${bodyHtml}</tbody></table>`);
        updatePropertiesPanel(null);
    }
    function getDescendantJobs(objectNode) {
        let foundJobs = new Set();
        const findRecursive = (node) => {
            const jobs = App.jobs.filter(j => j.uniqueName === node._attr['고유객체명']);
            jobs.forEach(job => foundJobs.add(job));
            if (node.children) {
                node.children.forEach(findRecursive);
            }
        };
        findRecursive(objectNode);
        return [...foundJobs];
    }
    // --- 페이지 3 초기화 및 이벤트 핸들러 ---
    function initPage3() {
        App = DataManager.loadAllAppData();
        objectModelMap = App.objectModelMap || {};
        objectVisibilityState = App.objectVisibilityState || {};
        initThreeJSViewer();
        renderGanttView();
        
        setTimeout(() => {
            if(App.objectVisibilityState) {
                Object.keys(App.objectVisibilityState).forEach(uniqueName => {
                    if (App.objectVisibilityState[uniqueName]) {
                        toggleObjectVisibility(uniqueName, true);
                    }
                });
            }
        }, 500);
    }
    
    $(document).ready(function() {
        initPage3();
        $('#btnLinkObjModels').on('click', () => {
            if (Object.keys(uploadedModels).length === 0) {
                return alert("먼저 3D 모델 파일을 뷰어에 드래그 앤 드롭으로 추가해주세요.");
            }
            let linkCount = 0;
            const allObjects = window.flattenTreeArr(App.objTreeArr);
            
            allObjects.forEach(({ node }) => {
                const uniqueName = node._attr['고유객체명'];
                if (!uniqueName) return;
                for (const modelName in uploadedModels) {
                    const modelBaseName = modelName.replace(/\.obj$/i, '');
                    if (uniqueName.includes(modelBaseName) || modelBaseName.includes(uniqueName)) {
                        objectModelMap[uniqueName] = [modelName];
                        objectVisibilityState[uniqueName] = false;
                        linkCount++;
                        break; 
                    }
                }
            });
            if (linkCount > 0) {
                DataManager.save('objectModelMap', objectModelMap);
                DataManager.save('objectVisibilityState', objectVisibilityState);
                alert(`${linkCount}개의 객체와 3D 모델이 자동으로 연결되었습니다. 간트차트의 OBJ 아이콘을 클릭하여 모델을 켜고 끌 수 있습니다.`);
                renderGanttView();
                Object.values(uploadedModels).forEach(model => model.visible = false);
            } else {
                alert("자동으로 연결할 수 있는 객체와 모델을 찾지 못했습니다. 객체의 '고유객체명'과 모델 파일 이름이 유사한지 확인해주세요.");
            }
        });
        $('#gantt-table-wrap').on('click', '.gantt-row', function() {
            const $this = $(this);
            $('#gantt-table-wrap .gantt-row').removeClass('selected-row');
            $this.addClass('selected-row');
            const uniqueName = $this.data('unique-name');
            const objNode = window.flattenTreeArr(App.objTreeArr).find(f => f.node._attr['고유객체명'] === uniqueName)?.node;
            if(objNode) updatePropertiesPanel({ type: 'object', data: objNode });
            highlight3DObjects(uniqueName);
        });
        $('#gantt-table-wrap').on('click', '.status-indicator.linked', function(e) {
            e.stopPropagation();
            const $icon = $(this);
            const uniqueName = $icon.data('unique-name');
            const newState = !$icon.hasClass('on');
            objectVisibilityState[uniqueName] = newState;
            DataManager.save('objectVisibilityState', objectVisibilityState);
            $icon.toggleClass('on', newState).toggleClass('off', !newState);
            toggleObjectVisibility(uniqueName, newState);
            if ($icon.closest('tr').hasClass('selected-row')) {
                highlight3DObjects(uniqueName);
            }
        });
        $('#btnFocusObject').on('click', () => {
            const selectedRow = $('#gantt-table-wrap .selected-row');
            if (selectedRow.length === 0) {
                return alert("먼저 간트 차트에서 이동할 객체 행을 선택하세요.");
            }
            const uniqueName = selectedRow.data('unique-name');
            const modelsToFocus = getDescendantModels(uniqueName)
                .map(name => uploadedModels[name])
                .filter(Boolean);
            focusOnObjects(modelsToFocus);
        });
        $('#btnViewAll').on('click', () => {
            const allVisibleModels = [];
            for(const uniqueName in objectVisibilityState) {
                if(objectVisibilityState[uniqueName]) {
                    const models = getDescendantModels(uniqueName)
                        .map(name => uploadedModels[name])
                        .filter(Boolean);
                    allVisibleModels.push(...models);
                }
            }
            if (allVisibleModels.length > 0) {
                focusOnObjects(allVisibleModels);
            } else {
                alert('뷰어에 표시된 객체가 없습니다. 간트 차트의 OBJ 아이콘을 클릭하여 모델을 화면에 표시하세요.');
            }
        });
    });
})(jQuery);