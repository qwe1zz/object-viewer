// js/common.js

/**
 * @description 브라우저의 localStorage를 사용하여 페이지 간 데이터를 관리합니다.
 */
const DataManager = {
    save: function(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.error("Error saving to localStorage", e);
            alert("데이터 저장 중 오류가 발생했습니다. 브라우저의 저장 공간이 부족할 수 있습니다.");
        }
    },
    load: function(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error("Error loading from localStorage", e);
            return null;
        }
    },
    /**
     * @description 필요한 모든 애플리케이션 데이터를 로드하여 App 객체로 반환합니다.
     */
    loadAllAppData: function() {
        const appData = {
            objTreeArr: this.load('objTreeArr') || [],
            taskTreeArr: this.load('taskTreeArr') || [],
            jobs: this.load('jobs') || [],
            weatherData: this.load('weatherData') || [],
            weatherHeaders: this.load('weatherHeaders') || [],
            objectModelMap: this.load('objectModelMap') || {},
            objectVisibilityState: this.load('objectVisibilityState') || {},
            dailyLogs: this.load('dailyLogs') || {}
        };
        return appData;
    }
};

/**
 * @description 트리 배열을 평탄화된 리스트로 변환합니다.
 */
window.flattenTreeArr = function(arr, level = 0, parentNode = null) {
    let out = [];
    if (!arr) return out;
    arr.forEach(node => {
        if (!node._attr) node._attr = {};
        out.push({ uid: node.uid, name: node.name, level, node: node, parent: parentNode });
        if (node.children) {
            out = out.concat(flattenTreeArr(node.children, level + 1, node));
        }
    });
    return out;
};

/**
 * @description UID로 트리에서 노드를 찾습니다.
 */
window.getNodeByUid = function(uid, tree) {
    for (let node of tree) {
        if (node.uid === uid) return node;
        if (node.children) {
            let found = getNodeByUid(uid, node.children);
            if (found) return found;
        }
    }
    return null;
};


/**
 * @description 숫자 형식을 소수점 2자리 문자열로 포맷팅합니다.
 */
window.formatNumber = function(value) {
    if (value === null || value === undefined || String(value).trim() === '') return '';
    const num = Number(value);
    if (isNaN(num)) return value;
    return String(parseFloat(num.toFixed(2)));
};

/**
 * @description 작업 수량과 생산성을 기반으로 1인 작업 소요일을 계산합니다.
 */
window.calculateWorkdays = function(qty, rate, restDay) {
    const HOURS_PER_DAY = 8;
    const numQty = parseFloat(qty);
    const numRate = parseFloat(rate);
    const numRestDay = parseInt(restDay, 10) || 0;

    if (isNaN(numQty) || isNaN(numRate) || numRate === 0) {
        return numRestDay > 0 ? `_${numRestDay}day` : "";
    }

    const totalHours = Math.ceil((numQty / numRate) * HOURS_PER_DAY);
    const dayPart = Math.floor(totalHours / HOURS_PER_DAY);
    const hourPart = totalHours % HOURS_PER_DAY;

    let timeLabel = "0H";
    if (dayPart > 0 && hourPart > 0) {
        timeLabel = `${dayPart}day${hourPart}H`;
    } else if (dayPart > 0) {
        timeLabel = `${dayPart}day`;
    } else if (hourPart > 0) {
        timeLabel = `${hourPart}H`;
    }

    if (numRestDay > 0) {
        return `${timeLabel}_${numRestDay}day`;
    }
    return timeLabel;
};