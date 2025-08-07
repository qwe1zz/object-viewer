// js/jspage4.js (성능 및 정확성 개선 버전)

(function($) {
    let App;
    let p4_simulatedJobs = [];
    let p4_selectedDate = new Date();

    function formatDateToYYYYMMDD(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function updateDailyWorkTitle(date) {
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        $('#daily-work-panel .panel-title > span').text(`📝 일일작업현황 : ${year}년 ${month}월 ${day}일`);
    }

    function initPage4() {
        App = DataManager.loadAllAppData();

        if (!App.jobs || App.jobs.length === 0 || !App.jobs.some(j => j.dailyWork && j.dailyWork.length > 0)) {
            $('#page4').html('<p style="text-align:center; color:#888; padding: 50px; font-size: 16px;">2페이지에서 JOB 생성 및 공정표 생성을 먼저 실행해주세요.</p>');
            return;
        }

        const firstWorkDay = findFirstWorkDay() || new Date().toISOString().split('T')[0];
        p4_selectedDate = new Date(firstWorkDay + 'T00:00:00');
        
        // 페이지 로딩 시 한 번만 전체 시뮬레이션 실행
        resetAndRunFullSimulation();
        
        setupControls();
        updateDailyWorkTitle(p4_selectedDate);
        renderDailyStatusTable(p4_selectedDate);
    }

    /**
     * [수정됨] 모든 실적 로그를 기반으로 공정 시뮬레이션을 처음부터 다시 실행하는 핵심 함수
     */
    function resetAndRunFullSimulation() {
        // 1. App.jobs 원본을 깊은 복사하여 시뮬레이션용 데이터 생성
        p4_simulatedJobs = JSON.parse(JSON.stringify(App.jobs));
        App.dailyLogs = DataManager.load('dailyLogs') || {};

        // 2. 모든 시뮬레이션 데이터 초기화
        p4_simulatedJobs.forEach(job => {
            job.status = 'Pending';
            job.reworkCount = 0;
            job.actualWork = {};
            job.remainingHours = parseWorkHours(job.workdays);
        });

        // 3. 저장된 모든 로그를 시간순으로 정렬하여 하나씩 다시 적용
        const sortedDates = Object.keys(App.dailyLogs).sort();
        sortedDates.forEach(dateStr => {
            const timeKeys = Object.keys(App.dailyLogs[dateStr]).sort();
            timeKeys.forEach(timeKey => {
                const log = App.dailyLogs[dateStr][timeKey];
                // 페이지 로딩 및 전체 재계산 시에는 로그를 출력하지 않음 (isInitialLoad = true)
                applyHourlyWorkAndRecalculate(dateStr, timeKey, log, true);
            });
        });

        // 4. 최종 시뮬레이션 결과를 간트 차트에 렌더링
        renderP4GanttChart();
    }
    
    function renderDailyStatusTable(date) {
        const dateStr = formatDateToYYYYMMDD(date);
        const dailyLog = App.dailyLogs[dateStr] || {};

        $('#daily-status-table tbody tr').each(function() {
            const $row = $(this);
            const timeKey = $row.data('time-key');
            const log = dailyLog[timeKey] || {};

            $row.find('.input-weather-a').val(log.weatherA || '맑음');
            $row.find('.input-weather-b').val(log.weatherB || '맑음');
            $row.find('.input-temp-a').val(log.tempA || '25');
            $row.find('.input-temp-b').val(log.tempB || '25');
            $row.find('.input-workers').val(log.workers || '0');
            $row.find('.input-materials').val(log.materials || 'O');
            $row.find('.input-equipment').val(log.equipment || 'O');
            $row.find('.input-safety').val(log.safety || 'O');
            $row.find('.input-quality').val(log.quality || 'O');
            $row.find('.input-quality-review').val(log.qualityReview || '양호');
            $row.find('.input-supervisor').val(log.supervisor || '');
        });
    }

    function findFirstWorkDay() {
        const allDates = App.jobs.flatMap(j => j.dailyWork?.map(d => d.date)).filter(Boolean).sort();
        return allDates.length > 0 ? allDates[0] : null;
    }

    function setupControls() {
        flatpickr("#calendar-container", {
            inline: true,
            locale: "ko",
            defaultDate: p4_selectedDate,
            onChange: function(selectedDates) {
                p4_selectedDate = selectedDates[0];
                updateDailyWorkTitle(p4_selectedDate);
                renderDailyStatusTable(p4_selectedDate);
            }
        });

        // [수정됨] 개별 '적용' 버튼 클릭 시, 로그 저장 후 전체 재시뮬레이션 실행
        $('#daily-status-table').on('click', '.apply-btn', function() {
            const $row = $(this).closest('tr');
            applyWorkFromRow($row); // 로그 저장
            resetAndRunFullSimulation(); // 전체 재계산 및 렌더링
        });

        // [수정됨] '전체 적용' 버튼 클릭 시, 모든 로그 저장 후 전체 재시뮬레이션 실행
        $('#btn-apply-all').on('click', function() {
            const dateStr = formatDateToYYYYMMDD(p4_selectedDate);
            if (!App.dailyLogs[dateStr]) App.dailyLogs[dateStr] = {};

            $('#daily-status-table tbody tr').each(function() {
                const $row = $(this);
                const timeKey = $row.data('time-key');
                App.dailyLogs[dateStr][timeKey] = {
                    weatherA: $row.find('.input-weather-a').val(),
                    weatherB: $row.find('.input-weather-b').val(),
                    tempA: $row.find('.input-temp-a').val(),
                    tempB: $row.find('.input-temp-b').val(),
                    workers: parseInt($row.find('.input-workers').val()) || 0,
                    materials: $row.find('.input-materials').val(),
                    equipment: $row.find('.input-equipment').val(),
                    safety: $row.find('.input-safety').val(),
                    quality: $row.find('.input-quality').val(),
                    qualityReview: $row.find('.input-quality-review').val(),
                    supervisor: $row.find('.input-supervisor').val()
                };
            });
            
            DataManager.save('dailyLogs', App.dailyLogs); // 변경된 모든 로그를 한 번에 저장
            resetAndRunFullSimulation(); // 전체 재계산 및 렌더링
            alert("모든 시간대의 작업 현황이 로그에 반영 및 재계산되었습니다.");
        });

        $('#p4-gantt-container').on('click', '.gantt-row, .sub-row', function() {
            const $this = $(this);
            const uniqueName = $this.data('unique-name');
            $('#p4-gantt-container tr').removeClass('selected-row');
            $(`tr[data-unique-name="${uniqueName}"]`).addClass('selected-row');
        });
    }
    
    function applyWorkFromRow($row) {
        const timeKey = $row.data('time-key');
        const dateStr = formatDateToYYYYMMDD(p4_selectedDate);
        const dailyInput = {
            weatherA: $row.find('.input-weather-a').val(),
            weatherB: $row.find('.input-weather-b').val(),
            tempA: $row.find('.input-temp-a').val(),
            tempB: $row.find('.input-temp-b').val(),
            workers: parseInt($row.find('.input-workers').val()) || 0,
            materials: $row.find('.input-materials').val(),
            equipment: $row.find('.input-equipment').val(),
            safety: $row.find('.input-safety').val(),
            quality: $row.find('.input-quality').val(),
            qualityReview: $row.find('.input-quality-review').val(),
            supervisor: $row.find('.input-supervisor').val()
        };
        
        if (!App.dailyLogs[dateStr]) App.dailyLogs[dateStr] = {};
        App.dailyLogs[dateStr][timeKey] = dailyInput;
        DataManager.save('dailyLogs', App.dailyLogs);
    }

    function renderP4GanttChart() {
        const $ganttContainer = $('#p4-gantt-container');
        
        const allPlanDates = App.jobs.flatMap(j => j.dailyWork?.map(d => d.date));
        const allActualDates = p4_simulatedJobs.flatMap(j => Object.keys(j.actualWork));
        const allDates = new Set([...allPlanDates, ...allActualDates].filter(Boolean));

        if (allDates.size === 0) {
            $ganttContainer.html('<p style="text-align:center; color:#888;">표시할 공정 데이터가 없습니다.</p>');
            return;
        }
        
        const sortedDates = [...allDates].sort();
        const dateArray = [];
        let startDate = new Date(sortedDates[0] + 'T00:00:00');
        let endDate = new Date(sortedDates[sortedDates.length - 1] + 'T00:00:00');

        for (let dt = new Date(startDate); dt <= endDate; dt.setDate(dt.getDate() + 1)) {
            dateArray.push(new Date(dt));
        }

        const holidaySet = new Set((App.weatherData || []).filter(d => d.holiday === 'O').map(d => d.date));

        let yearHeader = `<tr class="gantt-header-row-0"><th class="col-name" rowspan="4">고유객체명</th><th class="col-job" rowspan="4">JOB</th><th class="col-division" rowspan="4">구분</th>`;
        let monthHeader = '<tr class="gantt-header-row-1">';
        let dayHeader = '<tr class="gantt-header-row-2">';
        let hourHeader = '<tr class="gantt-header-row-3">';
        
        const dateHeaderMap = new Map();
        dateArray.forEach(d => {
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            if (!dateHeaderMap.has(year)) dateHeaderMap.set(year, new Map());
            if (!dateHeaderMap.get(year).has(month)) dateHeaderMap.get(year).set(month, []);
            dateHeaderMap.get(year).get(month).push(d);
        });

        for (const [year, months] of dateHeaderMap.entries()) {
            let yearColspan = 0;
            for (const [month, days] of months.entries()) {
                yearColspan += days.length * 8;
                monthHeader += `<th colspan="${days.length * 8}">${month}월</th>`;
                days.forEach(d => {
                    const dateStr = formatDateToYYYYMMDD(d);
                    const isHoliday = holidaySet.has(dateStr);
                    const holidayClass = isHoliday ? ' holiday-header' : '';
                    dayHeader += `<th colspan="8" class="${holidayClass}">${d.getDate()}일</th>`;
                    for(let h = 0; h < 8; h++) { hourHeader += `<th>${h + 9}${h==3?'':''}</th>`; }
                });
            }
            yearHeader += `<th colspan="${yearColspan}">${year}년</th>`;
        }
        yearHeader += '</tr>'; monthHeader += '</tr>'; dayHeader += '</tr>'; hourHeader += '</tr>';
        
        let bodyHtml = buildGanttRowsRecursive(App.objTreeArr, 0, dateArray, holidaySet);
        
        $ganttContainer.html(`<table><thead>${yearHeader}${monthHeader}${dayHeader}${hourHeader}</thead><tbody>${bodyHtml}</tbody></table>`);
    }

    function buildGanttRowsRecursive(nodes, level, dateArray, holidaySet) {
        let html = '';
        
        const sortedNodes = [...nodes].sort((a, b) => {
            const aJobs = getDescendantJobs(a, App.jobs);
            const bJobs = getDescendantJobs(b, App.jobs);
            if (aJobs.length === 0 && bJobs.length === 0) return 0;
            if (aJobs.length === 0) return 1;
            if (bJobs.length === 0) return -1;
            const aMinJobIndex = Math.min(...aJobs.map(j => App.jobs.findIndex(appJob => appJob.taskCode === j.taskCode && appJob.uniqueName === j.uniqueName)).filter(i => i !== -1));
            const bMinJobIndex = Math.min(...bJobs.map(j => App.jobs.findIndex(appJob => appJob.taskCode === j.taskCode && appJob.uniqueName === j.uniqueName)).filter(i => i !== -1));
            if (aMinJobIndex === Infinity) return 1;
            if (bMinJobIndex === Infinity) return -1;
            return aMinJobIndex - bMinJobIndex;
        });

        sortedNodes.forEach(objNode => {
            const uniqueName = objNode._attr['고유객체명'];
            const descendantJobs = getDescendantJobs(objNode, App.jobs);
            const descendantSimJobs = getDescendantJobs(objNode, p4_simulatedJobs);

            if (descendantJobs.length > 0) {
                const allJobNames = [...new Set(descendantJobs.map(j => `JOB${App.jobs.findIndex(appJob => appJob.taskCode === j.taskCode && appJob.uniqueName === j.uniqueName) + 1}`))].join(', ');
                
                html += `<tr class="gantt-row" data-unique-name="${uniqueName}">
                            <td rowspan="2" class="col-name" style="padding-left:${level * 20 + 10}px;">${uniqueName}</td>
                            <td rowspan="2" class="col-job" title="${allJobNames}">${allJobNames}</td>
                            <td class="col-division plan-label">예정</td>`;
                
                dateArray.forEach((d) => {
                    const dateStr = formatDateToYYYYMMDD(d);
                    const isHoliday = holidaySet.has(dateStr);
                    const holidayCellClass = isHoliday ? ' holiday-cell' : '';
                    const planSegments = descendantJobs.flatMap(j => j.dailyWork?.filter(dw => dw.date === dateStr && dw.segments).flatMap(dw => dw.segments) || []);
                    const planHours = new Array(8).fill(false);
                    planSegments.forEach(seg => {
                        for (let h = seg.start; h < seg.start + seg.duration && h < 8; h++) planHours[h] = true;
                    });
                    for (let h = 0; h < 8; h++) {
                        const cellClass = planHours[h] ? 'gantt-hour-cell active-plan' : 'gantt-hour-cell';
                        const dividerClass = h === 7 ? ' gantt-day-divider' : '';
                        html += `<td class="${cellClass}${dividerClass}${holidayCellClass}"></td>`;
                    }
                });
                html += `</tr>`;

                html += `<tr class="sub-row" data-unique-name="${uniqueName}">
                            <td class="col-division actual-label">실적</td>`;

                dateArray.forEach((d) => {
                    const dateStr = formatDateToYYYYMMDD(d);
                    const isHoliday = holidaySet.has(dateStr);
                    const holidayCellClass = isHoliday ? ' holiday-cell' : '';
                    const actualHours = new Array(8).fill(false);
                    
                    const workHourSlots = ['09', '10', '11', '13', '14', '15', '16', '17'];

                    descendantSimJobs.forEach(job => {
                        if (job.actualWork[dateStr]) {
                            for (let h = 0; h < workHourSlots.length; h++) {
                                const timeKey = workHourSlots[h];
                                if (job.actualWork[dateStr][timeKey] && job.actualWork[dateStr][timeKey].hours > 0) {
                                    actualHours[h] = true;
                                }
                            }
                        }
                    });

                    for (let h = 0; h < 8; h++) {
                        const cellClass = actualHours[h] ? 'gantt-hour-cell active-actual' : 'gantt-hour-cell';
                        const dividerClass = h === 7 ? ' gantt-day-divider' : '';
                        html += `<td class="${cellClass}${dividerClass}${holidayCellClass}"></td>`;
                    }
                });
                html += `</tr>`;
            }

            if (objNode.children?.length > 0) {
                html += buildGanttRowsRecursive(objNode.children, level + 1, dateArray, holidaySet);
            }
        });
        return html;
    }

    function getDescendantJobs(objectNode, jobList) {
        let foundJobs = new Set();
        const findRecursive = (node) => {
            const jobs = jobList.filter(j => j.uniqueName === node._attr['고유객체명']);
            jobs.forEach(job => foundJobs.add(job));
            if (node.children) {
                node.children.forEach(findRecursive);
            }
        };
        findRecursive(objectNode);
        return [...foundJobs];
    }

    /**
     * [핵심 수정 함수] 한 시간 동안의 실적을 시뮬레이션합니다.
     * '오늘 계획된 작업량' 제약을 제거하여 사용자의 실제 입력을 우선적으로 반영합니다.
     */
    function applyHourlyWorkAndRecalculate(dateStr, timeKey, input, isInitialLoad = false) {
        const enableLog = !isInitialLoad;

        let hourlyCapacity = parseInt(input.workers) || 0;
        if (hourlyCapacity === 0) return;

        // 1. 현재 시간에 작업 가능한 JOB 목록을 필터링 (선행작업 완료 여부 및 잔여 작업량 확인)
        const readyJobs = p4_simulatedJobs
            .filter(job => {
                const isReady = (job.status === 'Pending' || job.status === 'InProgress' || job.status === 'NeedsRework') && job.remainingHours > 0;
                return isReady && isPredecessorComplete(job);
            })
            .sort((a, b) => {
                const indexA = App.jobs.findIndex(j => j.taskCode === a.taskCode && j.uniqueName === a.uniqueName);
                const indexB = App.jobs.findIndex(j => j.taskCode === b.taskCode && j.uniqueName === b.uniqueName);
                return indexA - indexB;
            });
        
        if (readyJobs.length === 0) return;

        // 2. 현장 공통 조건(자재, 장비 등) 확인
        const siteConditionsMet = (input.materials === 'O' && input.equipment === 'O' && input.safety === 'O' && input.quality === 'O');
        if (!siteConditionsMet) return;

        // 3. 작업 가능한 JOB에 인력 배분
        for (const job of readyJobs) {
            if (hourlyCapacity <= 0) break;

            // 3-1. 날씨 조건 확인
            const jobLocation = job.location;
            let weatherAllowsWork = true;
            if (jobLocation === 'Site-A' && (input.weatherA === '비' || input.weatherA === '눈')) weatherAllowsWork = false;
            if (jobLocation === 'Site-B' && (input.weatherB === '비' || input.weatherB === '눈')) weatherAllowsWork = false;
            if (!weatherAllowsWork) continue;

            // [핵심 수정] '오늘 계획된 작업량' 제약을 제거하고, '가용 인력'과 'JOB의 전체 잔여량'만으로 작업량을 결정
            const workHours = Math.min(hourlyCapacity, job.remainingHours);

            if (workHours > 0) {
                // 실제 작업 기록
                if (!job.actualWork[dateStr]) job.actualWork[dateStr] = {};
                if (!job.actualWork[dateStr][timeKey]) job.actualWork[dateStr][timeKey] = { hours: 0, supervisor: '' };
                
                job.actualWork[dateStr][timeKey].hours += workHours;
                job.actualWork[dateStr][timeKey].supervisor = input.supervisor;

                // 데이터 업데이트
                job.remainingHours -= workHours;
                hourlyCapacity -= workHours;
                job.status = 'InProgress';

                // 작업 완료 처리
                if (job.remainingHours <= 0.001) {
                    job.remainingHours = 0;
                    if (input.qualityReview === '양호') {
                        job.status = 'Completed';
                    } else {
                        job.status = 'NeedsRework';
                        job.reworkCount++;
                        job.remainingHours += parseWorkHours(job.workdays); // 재작업 시간 추가
                    }
                }
            }
        }
    }
    
    function isPredecessorComplete(job) {
        if (!job.predecessor || job.predecessor.length === 0) return true;
        
        for (const predId of job.predecessor) {
            const predJob = p4_simulatedJobs.find(j => 
                (j.taskCode === predId && j.parentUniqueName === job.parentUniqueName) ||
                j.uniqueName === predId ||
                (j.parallelGroup && j.parallelGroup === predId && j.parentUniqueName === job.parentUniqueName)
            );

            if (predJob && predJob.status !== 'Completed') {
                return false;
            }
        }
        return true;
    }

    function parseWorkHours(label) {
        if (!label) return 0;
        const s = String(label).split("_")[0];
        let d = 0, h = 0;
        if (s.includes("day")) {
            const parts = s.split("day");
            d = parseInt(parts[0]) || 0;
            h = parts[1] ? (parseFloat(parts[1].replace("H", "")) || 0) : 0;
        } else if (s.includes("H")) { h = parseFloat(s.replace("H", "")) || 0; }
        return (d * 8) + h;
    }

    $(document).ready(initPage4);

})(jQuery);