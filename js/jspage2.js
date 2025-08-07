// js/jspage2.js

(function($) {
    window.App = DataManager.loadAllAppData();

    function formatValue(value, key) {
        if (value === null || value === undefined || String(value).trim() === '') return '';
        const num = Number(String(value).replace(/,/g, ''));
        if (isNaN(num)) return value;

        if (key === '단가') {
            return num.toLocaleString('en-US');
        }
        return parseFloat(num.toFixed(2)).toString();
    }

    function updateWeatherTableHighlights() {
        $('#weatherTableWrap tbody tr').removeClass('unused-worker potential-bottleneck');
        if (!window.App.weatherData.length || !window.App.jobs.length) return;

        const HOURS_PER_DAY = 8;

        window.App.weatherData.forEach((day, rowIndex) => {
            const $row = $('#weatherTableWrap tbody tr').eq(rowIndex);
            const assignedWorkers = parseInt(day['작업인원'], 10) || 0;
            
            if (assignedWorkers === 0 || (day['휴일'] && String(day['휴일']).trim() !== '')) {
                return;
            }

            let totalManHoursWorkedToday = 0;
            window.App.jobs.forEach(job => {
                const workToday = job.dailyWork?.find(d => d.date === day['작업날짜']);
                if (workToday) {
                    totalManHoursWorkedToday += workToday.hours || 0;
                }
            });

            if (totalManHoursWorkedToday === 0) {
                return;
            }

            const totalCapacityManHours = assignedWorkers * HOURS_PER_DAY;
            const unusedThresholdManHours = (assignedWorkers - 1) * HOURS_PER_DAY;

            if (totalManHoursWorkedToday > totalCapacityManHours) {
                $row.addClass('potential-bottleneck');
            } else if (totalManHoursWorkedToday <= unusedThresholdManHours) {
                $row.addClass('unused-worker');
            }
        });
    }


    function renderJobTable() {
        const preScheduleHeaders = [ "JOB ID", "객체명", "고유객체명", "상위고유객체명", "목적시설물", "위치", "작업명", "규격", "단위", "단가", "작업수량", "1인생산성", "필수공기", "1인작업소요일" ];
        const postScheduleHeaders = [ "총투입인원(MD)", "작업시작일", "작업종료일" ];
        
        const isScheduled = window.App.jobs.length > 0 && window.App.jobs.some(j => j.dailyWork && j.dailyWork.length > 0);
        let finalHeaders = [...preScheduleHeaders];
        const allWorkDates = isScheduled ? [...new Set(window.App.jobs.flatMap(j => j.dailyWork ? j.dailyWork.map(d => d.date) : []))].sort() : [];

        if (isScheduled) {
            finalHeaders.push(...postScheduleHeaders);
            allWorkDates.forEach((date, index) => {
                const dayNumber = index + 1;
                finalHeaders.push(
                    `${dayNumber}작업일`, 
                    `${dayNumber}작업일_작업인원`, 
                    `${dayNumber}작업일_작업소요시간`, 
                    `${dayNumber}작업일_작업량`, 
                    `${dayNumber}작업일_공정율`,
                    `${dayNumber}작업일_작업승인`,
                    `${dayNumber}작업일_작업승인자`,
                    `${dayNumber}작업일_작업승인일시`
                );
            });
        }
        finalHeaders.push("삭제");

        let headHtml = '<thead><tr>' + finalHeaders.map(h => `<th>${h}</th>`).join('') + '</tr></thead>';
        let bodyHtml = '<tbody>';

        const weatherMap = new Map((window.App.weatherData || []).map(d => [d['작업날짜'], d]));

        window.App.jobs.forEach((job, idx) => {
            const jobData = { 
                "JOB ID": job.jobId || `JOB${String(idx + 1).padStart(3, '0')}`, 
                "객체명": job.objName || '', 
                "고유객체명": job.uniqueName || '', 
                "상위고유객체명": job.parentUniqueName || '', 
                "목적시설물": job.purposeName || '', 
                "위치": job.location || '', 
                "작업명": job.taskName || '', 
                "규격": job.spec || '', 
                "단위": job.unitInfo || '', 
                "단가": formatValue(job.contractCost, '단가'), 
                "작업수량": formatValue(job.totalQty, '작업수량'), 
                "1인생산성": formatValue(job.productivity, '1인생산성'), 
                "필수공기": formatValue(job.restDay, '필수공기'), 
                "1인작업소요일": job.workdays || '', 
                "총투입인원(MD)": formatValue(job.workerManDays, '총투입인원(MD)'), 
                "작업시작일": job.startDate || '', 
                "작업종료일": job.endDate || '' 
            };
            const dailyWorkMap = new Map();
            if(job.dailyWork){ job.dailyWork.forEach(d => { dailyWorkMap.set(d.date, d); }); }

            bodyHtml += `<tr data-job-idx="${idx}" class="job-row">`;
            finalHeaders.forEach(h => {
                if (h === '삭제') {
                    bodyHtml += `<td><button data-idx="${idx}" class="btnJobDel" style="padding: 2px 5px; font-size: 11px;">삭제</button></td>`;
                    return;
                }
                let cellValue = jobData[h] !== undefined ? jobData[h] : '';

                if (cellValue === '' && isScheduled) {
                    const match = h.match(/^(\d+)작업일/);
                    if (match) {
                        const dayNumber = parseInt(match[1], 10);
                        const targetDate = allWorkDates[dayNumber - 1];
                        if (targetDate && dailyWorkMap.has(targetDate)) {
                            const dayData = dailyWorkMap.get(targetDate);
                            const weatherDayInfo = weatherMap.get(targetDate);
                            
                            if (h.endsWith('작업일')) {
                                cellValue = dayData.date;
                            } else if (h.endsWith('작업인원')) {
                                cellValue = weatherDayInfo ? (weatherDayInfo['작업인원'] || 0) : 0;
                            } 
                            else if (h.endsWith('작업소요시간')) {
                                if (dayData.segments && dayData.segments.length > 0) {
                                    const firstSegmentStart = Math.min(...dayData.segments.map(s => s.start));
                                    const lastSegmentEnd = Math.max(...dayData.segments.map(s => s.start + s.duration));
                                    const elapsedHours = lastSegmentEnd - firstSegmentStart;
                                    cellValue = `${elapsedHours}H`;
                                } else {
                                    cellValue = '0H';
                                }
                            } else if (h.endsWith('작업량')) {
                                cellValue = formatValue(dayData.qty, '작업량');
                            } else if (h.endsWith('공정율')) {
                                cellValue = formatValue(dayData.progress, '공정율') + '%';
                            }
                        }
                    }
                }
                bodyHtml += `<td>${cellValue}</td>`;
            });
            bodyHtml += '</tr>';
        });
        bodyHtml += '</tbody>';
        $('#jobTableWrap').html(`<table>${headHtml}${bodyHtml}</table>`);
    }

    function renderWeatherTable() {
        if (!window.App.weatherData || window.App.weatherData.length === 0) {
            $('#weatherTableWrap').html('<p style="text-align:center; color:#888; margin-top:20px;">기상 현황 파일을 업로드해주세요.</p>');
            return;
        }
        
        let dynamicHeaders = [...(window.App.weatherHeaders || [])];
        const siteHeaders = dynamicHeaders.filter(h => h.startsWith('Site-'));
        siteHeaders.forEach(siteHeader => {
            const probHeader = `${siteHeader}_불가확률(%)`;
            if (window.App.weatherData.some(row => row[probHeader] !== undefined) && !dynamicHeaders.includes(probHeader)) {
                const siteIndex = dynamicHeaders.indexOf(siteHeader);
                dynamicHeaders.splice(siteIndex + 1, 0, probHeader);
            }
        });

        const readOnlyCols = ['작업날짜', '요일'];
        const narrowCols = ['작업날짜', '요일', '휴일', '작업인원'];

        let headHtml = '<thead><tr>';
        dynamicHeaders.forEach(h => {
            let cls = '';
            if (h.startsWith('Site-') && !h.includes('_')) cls += ' col-site';
            if (h.includes('_불가확률')) cls += ' col-weather-prob';
            if (narrowCols.includes(h) || (h.startsWith('Site-') && !h.includes('_'))) {
                cls += ' col-weather-narrow';
            }
            headHtml += `<th class="${cls.trim()}">${h}</th>`;
        });
        headHtml += '</tr></thead>';
        
        let bodyHtml = '<tbody>';
        window.App.weatherData.forEach((row, rowIndex) => {
            bodyHtml += `<tr>`;
            dynamicHeaders.forEach(header => {
                let value = row[header] !== undefined ? row[header] : '';
                if (header.startsWith('Site-') && !header.includes('_') && typeof value === 'object' && value !== null) {
                    value = value.weather || '';
                }
                if (header.includes('_불가확률')) {
                    value = value ? `${parseFloat(value).toFixed(1)}%` : '';
                }

                let tdClass = '';
                if (narrowCols.includes(header) || (header.startsWith('Site-') && !header.includes('_'))) {
                    tdClass = 'col-weather-narrow';
                }

                if (readOnlyCols.includes(header) || header.includes('_불가확률')) {
                    bodyHtml += `<td class="${tdClass}"><input type="text" value="${value}" readonly></td>`;
                } else {
                    bodyHtml += `<td class="${tdClass}"><input type="text" value="${value}" data-row-idx="${rowIndex}" data-key="${header}"></td>`;
                }
            });
            bodyHtml += '</tr>';
        });
        bodyHtml += '</tbody>';
        $('#weatherTableWrap').html(`<table>${headHtml}${bodyHtml}</table>`);
    }

    function getEarliestPossibleStart(job, allSimJobs) {
        let latestPredecessorEndTime = new Date(0);

        const rawPredecessors = Array.isArray(job.predecessor) ? job.predecessor : (job.predecessor ? String(job.predecessor).split(',') : []);
        if (rawPredecessors.length === 0) {
            return latestPredecessorEndTime; 
        }

        for (const predIdentifier of rawPredecessors) {
            const trimmed = predIdentifier.trim();
            if (!trimmed) continue;
            
            let predJobs = [];
            const predJobById = allSimJobs.find(j => j.jobId === trimmed);
            if (predJobById) {
                predJobs.push(predJobById);
            } 
            else if (allSimJobs.some(j => j.uniqueName === trimmed)) {
                predJobs = allSimJobs.filter(j => j.uniqueName === trimmed);
            } else if (trimmed.startsWith('G')) {
                predJobs = allSimJobs.filter(j => j.parentUniqueName === job.parentUniqueName && j.parallelGroup === trimmed);
            } else {
                const targetJob = allSimJobs.find(j => j.taskCode === trimmed && j.parentUniqueName === job.parentUniqueName);
                if (targetJob) predJobs.push(targetJob);
            }

            for (const predJob of predJobs) {
                if (!predJob.endDateTime) return new Date('9999-12-31'); 
                if (predJob.endDateTime.getTime() > latestPredecessorEndTime.getTime()) {
                    latestPredecessorEndTime = predJob.endDateTime;
                }
            }
        }
        return latestPredecessorEndTime;
    }

    function runSingleScheduleSimulation(initialJobs, initialCalendarMap, maxDailyWorkers, isAutoMode, useProbabilisticWeather, nonPerformableCounts) {
        const workerHeaderKey = '작업인원';
        const HOURS_PER_DAY = 8;
        const bottleneckDates = new Set();
        
        const simJobs = JSON.parse(JSON.stringify(initialJobs));
        const calendarMap = new Map(JSON.parse(JSON.stringify(Array.from(initialCalendarMap.entries()))));
        
        function parseWorkHours(label) {
            if (!label) return 0;
            const s = String(label).split("_")[0];
            let d = 0, h = 0;
            if (s.includes("day")) {
                const parts = s.split("day");
                d = parseInt(parts[0]) || 0;
                h = parseFloat(parts[1].replace("H", "")) || 0;
            } else if (s.includes("H")) { h = parseFloat(s.replace("H", "")) || 0; }
            return (d * HOURS_PER_DAY) + h;
        }

        simJobs.forEach((job, index) => {
            job.originalIndex = index;
            job.totalHours = parseWorkHours(job.workdays);
            job.remainingHours = job.totalHours;
            job.isComplete = false;
            job.startDate = '';
            job.endDate = '';
            job.endDateTime = null;
            job.dailyWork = [];
            job.workerManDays = 0;
        });

        const sortedDates = Array.from(calendarMap.keys()).sort();
        const purposeFacilityCureBlocks = new Map();
        let lastWorkDate = null;
        
        const objTreeFlat = window.App.objTreeArr ? flattenTreeArr(window.App.objTreeArr) : [];
        const parentOrder = [...new Set(objTreeFlat.map(item => item.node._attr['상위고유객체명']))].filter(Boolean);
        const siteHeaders = (window.App.weatherHeaders || []).filter(h => h.startsWith('Site-') && !h.includes('_'));

        const areDependenciesMet = (job, currentDateTime) => {
            const currentTime = currentDateTime.getTime();
            const rawPredecessors = Array.isArray(job.predecessor) ? job.predecessor : (job.predecessor ? String(job.predecessor).split(',') : []);
            if (rawPredecessors.length > 0) {
                for (const predIdentifier of rawPredecessors) {
                    const trimmed = predIdentifier.trim();
                    if (!trimmed) continue;
                    let predJobs = [];
                    const predJobById = simJobs.find(j => j.jobId === trimmed);
                    if (predJobById) {
                        predJobs.push(predJobById);
                    } else if (simJobs.some(j => j.uniqueName === trimmed)) {
                        predJobs = simJobs.filter(j => j.uniqueName === trimmed);
                    } else if (trimmed.startsWith('G')) {
                        predJobs = simJobs.filter(j => j.parentUniqueName === job.parentUniqueName && j.parallelGroup === trimmed);
                    } else {
                        const targetJob = simJobs.find(j => j.taskCode === trimmed && j.parentUniqueName === job.parentUniqueName);
                        if (targetJob) predJobs.push(targetJob);
                    }
                    for (const predJob of predJobs) {
                        if (!predJob.isComplete || predJob.endDateTime.getTime() > currentTime) return false;
                    }
                }
            }
            const myParentIndex = parentOrder.indexOf(job.parentUniqueName);
            for (let i = 0; i < myParentIndex; i++) {
                const prevParent = parentOrder[i];
                const prevParentJobs = simJobs.filter(j => j.parentUniqueName === prevParent && j.purposeName === job.purposeName);
                if (prevParentJobs.length > 0 && !prevParentJobs.every(j => j.isComplete)) return false;
            }
            
            return true;
        };

        let activeGroupLocation = null;

        for (const dateStr of sortedDates) {
            const dayInfo = calendarMap.get(dateStr);
            if (dayInfo['휴일'] && String(dayInfo['휴일']).trim() !== '') {
                dayInfo[workerHeaderKey] = 0;
                dayInfo.neededWorkers = 0;
                continue;
            }

            const dailyWeatherOutcomes = new Map();
            const nonWorkableSitesToday = new Set();
            siteHeaders.forEach(site => {
                const weatherInfo = dayInfo[site];
                const isOk = !useProbabilisticWeather ? (String(weatherInfo).trim() !== '비') : (Math.random() >= (weatherInfo?.rainProbability || 0));
                dailyWeatherOutcomes.set(site, isOk);
                if (!isOk && useProbabilisticWeather) {
                    nonWorkableSitesToday.add(site);
                }
            });
            
            if (useProbabilisticWeather) {
                const countsForDate = nonPerformableCounts.get(dateStr) || new Map();
                nonWorkableSitesToday.forEach(site => {
                    countsForDate.set(site, (countsForDate.get(site) || 0) + 1);
                });
                if (countsForDate.size > 0) {
                    nonPerformableCounts.set(dateStr, countsForDate);
                }
            }

            let workerAvailability = Array(isAutoMode ? 1000 : maxDailyWorkers).fill(0);
            let dailyTotalManHours = 0;

            let workDoneInLoop = true;
            while(workDoneInLoop) {
                workDoneInLoop = false;

                const nextAvailableHour = Math.min(...workerAvailability);
                if (nextAvailableHour >= HOURS_PER_DAY) break;

                const availableWorkerIndices = [];
                workerAvailability.forEach((h, i) => {
                    if (h <= nextAvailableHour) availableWorkerIndices.push(i);
                });

                if (activeGroupLocation) {
                    const isGroupComplete = simJobs
                        .filter(j => j.location === activeGroupLocation)
                        .every(j => j.isComplete);
                    
                    if (isGroupComplete) {
                        activeGroupLocation = null;
                    }
                }
                
                const currentDateTime = new Date(`${dateStr}T${String(Math.floor(nextAvailableHour)).padStart(2, '0')}:00:00`);
                
                const readyJobs = simJobs
                    .filter(j => !j.isComplete && areDependenciesMet(j, currentDateTime))
                    .sort((a, b) => {
                        if (activeGroupLocation) {
                            const aIsInActiveGroup = (a.location === activeGroupLocation);
                            const bIsInActiveGroup = (b.location === activeGroupLocation);
                            if (aIsInActiveGroup && !bIsInActiveGroup) return -1;
                            if (!aIsInActiveGroup && bIsInActiveGroup) return 1;
                        }
                        const earliestStartA = getEarliestPossibleStart(a, simJobs);
                        const earliestStartB = getEarliestPossibleStart(b, simJobs);
                        if (earliestStartA.getTime() !== earliestStartB.getTime()) {
                            return earliestStartA.getTime() - earliestStartB.getTime();
                        }
                        return a.originalIndex - b.originalIndex;
                    });

                let jobScheduled = false;
                for(const job of readyJobs) {
                    if (purposeFacilityCureBlocks.get(job.purposeName)?.has(dateStr)) continue;

                    const siteLocation = job.location || 'Site-A';
                    if (!dailyWeatherOutcomes.get(siteLocation)) continue;

                    // [신규] 품질 유지 로직: 필수공기 작업이 중간에 시작될 경우, 당일 완료 가능한지 확인
                    const hasRestDay = (parseInt(job.restDay, 10) || 0) > 0;
                    const isStartingMidDay = nextAvailableHour > 0;

                    if (hasRestDay && isStartingMidDay) {
                        const workersToAssignCheck = availableWorkerIndices.length;
                        if (workersToAssignCheck > 0) {
                            const hoursLeftInDay = HOURS_PER_DAY - nextAvailableHour;
                            const availableManHoursToday = workersToAssignCheck * hoursLeftInDay;

                            // 남은 작업시간이 오늘 가용 맨아워를 초과하면, 이 작업은 오늘 시작하지 않고 다음날로 넘김
                            if (job.remainingHours > availableManHoursToday) {
                                continue; // 다음 readyJob으로 넘어감
                            }
                        }
                    }
                    // --- 로직 종료 ---

                    const workersToAssign = availableWorkerIndices.length;
                    if (workersToAssign === 0) continue;

                    const hoursLeftInDayForWorkers = HOURS_PER_DAY - nextAvailableHour;
                    const hoursNeededForJob = job.remainingHours / workersToAssign;
                    
                    let hoursToWorkThisSession = Math.min(hoursLeftInDayForWorkers, hoursNeededForJob);
                    
                    if (hoursToWorkThisSession > 0.001) {
                        const blockedDuration = Math.ceil(hoursToWorkThisSession);
                        if (nextAvailableHour + blockedDuration > HOURS_PER_DAY) continue;

                        workDoneInLoop = true;
                        jobScheduled = true;
                        
                        if (!job.startDate) job.startDate = dateStr;
                        
                        if (!activeGroupLocation) {
                            activeGroupLocation = job.location;
                        }
                        
                        const manHoursWorked = hoursToWorkThisSession * workersToAssign;
                        job.remainingHours -= manHoursWorked;

                        const endHour = nextAvailableHour + blockedDuration;
                        availableWorkerIndices.forEach(i => { workerAvailability[i] = endHour; });
                        dailyTotalManHours += manHoursWorked;

                        let dayWorkEntry = job.dailyWork.find(d => d.date === dateStr);
                        if (!dayWorkEntry) {
                            dayWorkEntry = { date: dateStr, hours: 0, qty: 0, progress: 0, segments: [] };
                            job.dailyWork.push(dayWorkEntry);
                        }
                        dayWorkEntry.hours += manHoursWorked;
                        dayWorkEntry.segments.push({ start: nextAvailableHour, duration: blockedDuration });
                        
                        if (job.remainingHours < 0.01) {
                            job.isComplete = true;
                            job.endDate = dateStr;
                            job.endDateTime = new Date(`${dateStr}T${String(Math.floor(endHour)).padStart(2, '0')}:00:00`);
                            lastWorkDate = dateStr;

                            const restDays = parseInt(job.restDay, 10) || 0;
                            if (restDays > 0) {
                                if (!purposeFacilityCureBlocks.has(job.purposeName)) {
                                    purposeFacilityCureBlocks.set(job.purposeName, new Set());
                                }
                                let cureStartDate = new Date(dateStr);
                                for (let d = 0; d < restDays; d++) {
                                    const cureDateStr = cureStartDate.toISOString().split('T')[0];
                                    if (calendarMap.has(cureDateStr)) {
                                        purposeFacilityCureBlocks.get(job.purposeName).add(cureDateStr);
                                    }
                                    cureStartDate.setDate(cureStartDate.getDate() + 1);
                                }
                            }
                        }
                        break;
                    }
                }
                if (!jobScheduled) workDoneInLoop = false;
            }

            const neededWorkersToday = Math.ceil(dailyTotalManHours / HOURS_PER_DAY);
            dayInfo.neededWorkers = neededWorkersToday;
            
            const assignedWorkers = isAutoMode ? neededWorkersToday : (dailyTotalManHours > 0 ? maxDailyWorkers : 0);
            dayInfo[workerHeaderKey] = assignedWorkers;

            if (!isAutoMode && assignedWorkers < neededWorkersToday) {
                bottleneckDates.add(dateStr);
            }
            
            simJobs.forEach(job => {
                const workToday = job.dailyWork.find(d => d.date === dateStr);
                if (workToday) {
                    workToday.qty = job.totalHours > 0 ? (workToday.hours / job.totalHours) * job.totalQty : 0;
                    workToday.progress = job.totalHours > 0 ? (workToday.hours / job.totalHours) * 100 : 0;
                    job.workerManDays += workToday.hours / HOURS_PER_DAY;
                }
            });
        } 
        
        const allJobsComplete = simJobs.every(j => j.isComplete);
        const firstDate = new Date(sortedDates[0]);
        const lastDate = allJobsComplete && lastWorkDate ? new Date(lastWorkDate) : null;
        const durationInDays = lastDate ? Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1 : Infinity;

        simJobs.forEach(j => { delete j.remainingHours; delete j.endDateTime; });

        return { finalJobs: simJobs, finalCalendarMap: calendarMap, duration: durationInDays, endDate: allJobsComplete ? lastWorkDate : '미완료', bottleneckDates };
    }

    function runMonteCarloAndGenerateSchedule(maxDailyWorkers, isAutoMode = false) {
        if (window.App.weatherData.length === 0) {
            return alert("기상 현황 데이터를 먼저 업로드해주세요.");
        }
        const NUM_SIMULATIONS = 500;
        const probabilisticWeatherData = JSON.parse(JSON.stringify(window.App.weatherData));
        const siteHeaders = (window.App.weatherHeaders || []).filter(h => h.startsWith('Site-') && !h.includes('_'));

        for(let i = 0; i < probabilisticWeatherData.length; i++) {
            siteHeaders.forEach(site => {
                const currentDayWeather = String(probabilisticWeatherData[i][site] || '').trim();
                let rainProb = 0;
                if (currentDayWeather === '비') {
                    rainProb = 1.0;
                } else { 
                    rainProb = 0.3;
                }
                probabilisticWeatherData[i][site] = { weather: currentDayWeather, rainProbability: rainProb };
            });
        }
        
        const initialCalendarMap = new Map(probabilisticWeatherData.map(day => [day['작업날짜'], day]));
        const simulationResults = [];
        const nonPerformableCounts = new Map();

        for (let i = 0; i < NUM_SIMULATIONS; i++) {
            const result = runSingleScheduleSimulation(window.App.jobs, initialCalendarMap, maxDailyWorkers, isAutoMode, true, nonPerformableCounts);
            if (result.duration !== Infinity) simulationResults.push(result);
        }

        if (simulationResults.length === 0) {
            alert("시뮬레이션 결과, 모든 시나리오에서 공사를 완료할 수 없었습니다. 공사 기간이나 작업 조건을 확인해주세요.");
            return;
        }

        simulationResults.sort((a, b) => a.duration - b.duration);
        const medianResult = simulationResults[Math.floor(simulationResults.length / 2)];
        
        window.App.jobs = medianResult.finalJobs;
        window.App.weatherData = Array.from(medianResult.finalCalendarMap.values());
        window.App.weatherData.forEach(day => {
            const countsForDate = nonPerformableCounts.get(day['작업날짜']);
            if (countsForDate) {
                for (const [site, count] of countsForDate.entries()) {
                    day[`${site}_불가확률(%)`] = (count / NUM_SIMULATIONS) * 100;
                }
            }
            siteHeaders.forEach(site => {
                const val = day[site];
                if (typeof val === 'object' && val !== null && val.weather) {
                    day[site] = val.weather;
                }
            });
        });

        DataManager.save('jobs', window.App.jobs);
        DataManager.save('weatherData', window.App.weatherData);
        renderJobTable();
        renderWeatherTable();
        updateWeatherTableHighlights();

        const durations = simulationResults.map(r => r.duration);
        const alertMessage = `
            [몬테카를로 공정 예측 결과 (N=${simulationResults.length})]
            ------------------------------------------
            - 대표 공정표가 업데이트 되었습니다. (중앙값 기준)
            - 총 공사기간 (달력일 기준):
                > 최소: ${Math.min(...durations)}일
                > 평균: ${(durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1)}일
                > 최대: ${Math.max(...durations)}일
            - 최종 완료 예정일:
                > 중앙값: ${medianResult.endDate}
                > 신뢰도 80%: ${simulationResults[Math.floor(simulationResults.length * 0.8)].endDate}
            ------------------------------------------
            '작업일 및 기상 현황' 테이블에서 Site별 '작업 불가 확률'을 확인하세요.
        `;
        alert(alertMessage.replace(/^ +/gm, ''));
    }

    function calculateWorkdays(qty, rate, restDay) {
        const HOURS_PER_DAY = 8;
        const numQty = parseFloat(qty);
        const numRate = parseFloat(rate);
        const numRestDay = parseInt(restDay, 10) || 0;

        if (isNaN(numQty) || isNaN(numRate) || numRate === 0) {
            return numRestDay > 0 ? `_${numRestDay}day` : "";
        }

        const totalHours = (numQty / numRate) * HOURS_PER_DAY;
        const dayPart = Math.floor(totalHours / HOURS_PER_DAY);
        const hourPart = totalHours % HOURS_PER_DAY;

        let timeLabel = "0H";
        if (dayPart > 0 && hourPart > 0.01) {
            timeLabel = `${dayPart}day${hourPart.toFixed(1)}H`;
        } else if (dayPart > 0) {
            timeLabel = `${dayPart}day`;
        } else if (hourPart > 0.01) {
            timeLabel = `${hourPart.toFixed(1)}H`;
        }

        if (numRestDay > 0) {
            return `${timeLabel}_${numRestDay}day`;
        }
        return timeLabel;
    }

    // --- 이하 이벤트 핸들러 ---

    $('#btnCreateJob').on('click', function () {
        if (!window.App.objTreeArr || window.App.objTreeArr.length === 0) return alert("먼저 1페이지에서 객체 데이터를 불러와주세요.");
        if (!window.App.taskTreeArr || window.App.taskTreeArr.length === 0) return alert("먼저 1페이지에서 작업 데이터를 불러와주세요.");
        
        const taskMap = new Map(flattenTreeArr(window.App.taskTreeArr).map(({ node }) => [node._attr['작업명'], node._attr]));
        let preliminaryJobs = [];
        const objTreeFlat = flattenTreeArr(window.App.objTreeArr);
        
        objTreeFlat.forEach(({ node: objNode }) => {
            const linkedTasks = objNode._attr.linkedTasks || [];
            let previousJobId = null;

            linkedTasks.forEach((linkedTask, index) => {
                const taskName = linkedTask['작업명'];
                const taskAttr = taskMap.get(taskName);

                if (taskAttr) {
                    const predecessors = new Set();
                    if (taskAttr['선행작업']) String(taskAttr['선행작업']).split(',').forEach(p => predecessors.add(p.trim()));
                    if (index === 0 && objNode._attr['선행객체']) {
                        predecessors.add(objNode._attr['선행객체']);
                    }
                    if (previousJobId) {
                        predecessors.add(previousJobId);
                    }
                    
                    const qty = Number(linkedTask['작업수량'] || 1);
                    const rate = taskAttr['1인생산성'] || '';
                    const restDay = taskAttr['필수공기'] || '';
                    
                    const currentJobId = `${objNode._attr['고유객체명']}_${taskName}`;

                    preliminaryJobs.push({ 
                        jobId: currentJobId,
                        objName: objNode.name || '', 
                        uniqueName: objNode._attr['고유객체명'] || '', 
                        parentUniqueName: objNode._attr['상위고유객체명'] || '', 
                        purposeName: objNode._attr['목적시설물'] || `(미지정)`, 
                        taskName: taskName || '', 
                        taskCode: taskAttr['작업코드'] || '', 
                        predecessor: [...predecessors].filter(Boolean),
                        parallelGroup: taskAttr['병렬그룹ID'] || '', 
                        spec: taskAttr['규격'] || '', 
                        unitInfo: linkedTask['단위'] || '', 
                        contractCost: Number(taskAttr['단가'] || 0), 
                        totalQty: qty, 
                        productivity: rate, 
                        restDay: restDay, 
                        workdays: calculateWorkdays(qty, rate, restDay), 
                    });

                    previousJobId = currentJobId;
                }
            });
        });

        if (preliminaryJobs.length === 0) return alert("1페이지에서 객체와 작업을 연결해주세요. 연결된 작업이 없습니다.");
        
        window.App.jobs = preliminaryJobs;
        DataManager.save('jobs', window.App.jobs);
        renderJobTable();
        alert(`✅ 객체 및 작업 순서를 반영하여 JOB ${window.App.jobs.length}개가 생성되었습니다.`);
    });
    
    $('#btnAddLocation').on('click', function() {
        const selectedJobRows = $('#jobTableWrap .job-row.selected');
        const selectedWeatherHeader = $('#weatherTableWrap th.selected');
        if (selectedJobRows.length === 0) return alert("먼저 JOB 테이블에서 위치를 지정할 JOB 행을 클릭하여 선택하세요.");
        if (selectedWeatherHeader.length !== 1) return alert("기상 현황 테이블에서 기준이 될 Site 헤더(예: Site-A) 하나만 클릭하여 선택하세요.");
        
        const locationName = selectedWeatherHeader.text().trim();
        selectedJobRows.each(function() {
            const jobIndex = $(this).data('job-idx');
            if (window.App.jobs[jobIndex]) {
                window.App.jobs[jobIndex].location = locationName;
            }
        });
        
        DataManager.save('jobs', window.App.jobs);
        selectedJobRows.removeClass('selected');
        renderJobTable();
        alert(`${selectedJobRows.length}개의 JOB에 위치 [${locationName}]을(를) 지정했습니다.`);
    });

    $('#btnGenerateScheduleOptimized').on('click', function() {
        if (window.App.jobs.length === 0) return alert("먼저 JOB을 생성해주세요.");
        if (window.App.weatherData.length === 0) return alert("기상 현황 데이터를 먼저 업로드해주세요.");
        $('#workforce-optimization-modal').css('display', 'flex');
    });

    $('#btn-confirm-optimization').on('click', function() {
        const maxWorkers = parseInt($('#max-daily-workers').val(), 10);
        if (isNaN(maxWorkers) || maxWorkers <= 0) return alert("1 이상의 유효한 최대 인원 수를 입력하세요.");
        $('#workforce-optimization-modal').hide();
        runMonteCarloAndGenerateSchedule(maxWorkers, false);
    });

    $('#btn-cancel-optimization').on('click', () => $('#workforce-optimization-modal').hide());
    
    $('#btnJobExportJson').on('click', function(){
      if (!window.App.jobs || window.App.jobs.length === 0) return alert("저장할 JOB 데이터가 없습니다.");
      const blob = new Blob([JSON.stringify(window.App.jobs, null, 2)], {type:'application/json'});
      const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='jobs.json';
      a.click(); URL.revokeObjectURL(a.href);
    });
    
    $('#btnWeatherExportJson').on('click', function(){
      if (!window.App.weatherData || window.App.weatherData.length === 0) return alert("저장할 기상 현황 데이터가 없습니다.");
      const blob = new Blob([JSON.stringify(window.App.weatherData, null, 2)], {type:'application/json'});
      const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='weather_data.json';
      a.click(); URL.revokeObjectURL(a.href);
    });

    $('#btnJobExportExcel').on('click', function(){
        if(window.App.jobs.length === 0) return alert("저장할 JOB 데이터가 없습니다.");
        const headers = Array.from($('#jobTableWrap th')).map(th => $(th).text()).slice(0, -1);
        let rows = [headers];
        $('#jobTableWrap tbody tr').each(function() {
            const row = Array.from($(this).find('td')).map(td => $(td).text()).slice(0, -1);
            rows.push(row);
        });
        let ws = XLSX.utils.aoa_to_sheet(rows);
        let wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "JOB_공정계획");
        XLSX.writeFile(wb, "jobs_schedule_exported.xlsx");
    });
    
    $('#weatherExcelFile').on('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(sheet, { defval:'' });
                if (jsonData.length > 0) {
                    window.App.weatherHeaders = Object.keys(jsonData[0]);
                    const dateColumnName = window.App.weatherHeaders.find(h => h.includes('날짜'));
                    if (dateColumnName) {
                        jsonData.forEach(row => {
                            const serial = row[dateColumnName];
                            if (typeof serial === 'number' && serial > 1) {
                                const date = XLSX.SSF.parse_date_code(serial);
                                row[dateColumnName] = `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;
                            }
                        });
                    }
                    window.App.weatherData = jsonData;
                    DataManager.save('weatherData', window.App.weatherData);
                    DataManager.save('weatherHeaders', window.App.weatherHeaders);
                    renderWeatherTable();
                }
            } catch (error) {
                alert("기상 현황 엑셀 파일을 처리하는 중 오류가 발생했습니다.");
            } finally {
                e.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    });

    $(document).ready(function() {
        renderJobTable();
        renderWeatherTable();

        $('#jobTableWrap').on('click', '.job-row', function(e) {
            if (e.ctrlKey || e.metaKey) {
                $(this).toggleClass('selected');
            } else {
                $('#jobTableWrap .job-row').not(this).removeClass('selected');
                $(this).toggleClass('selected');
            }
        });

        $('#jobTableWrap').on('click', '.btnJobDel', function(e) {
            e.stopPropagation();
            const jobIndex = $(this).data('idx');
            const jobName = window.App.jobs[jobIndex]?.taskName || `JOB ${jobIndex + 1}`;
            if (confirm(`'${jobName}' 작업을 삭제하시겠습니까?`)) {
                window.App.jobs.splice(jobIndex, 1);
                DataManager.save('jobs', window.App.jobs);
                renderJobTable();
            }
        });

        $('#weatherTableWrap').on('click', 'th.col-site', function() {
            $(this).toggleClass('selected').siblings().removeClass('selected');
        });

        $('#weatherTableWrap').on('input', 'input[type="text"]:not([readonly])', function() {
            const rowIndex = $(this).data('row-idx');
            const key = $(this).data('key');
            if (window.App.weatherData[rowIndex]) {
                window.App.weatherData[rowIndex][key] = $(this).val();
                DataManager.save('weatherData', window.App.weatherData);
            }
        });
    });
})(jQuery);