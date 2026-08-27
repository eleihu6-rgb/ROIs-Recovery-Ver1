#include <stdio.h>
#include <vector>
#include <algorithm>

#include <limits.h>

#include <iostream>
#include <time.h>
#include "UtilFunc.h"
#include "CrewDB.h"
#include "Log/Logger.h"

//根据crew_base计算 map<time_t, offset>
//如TPE 2017-1-1
//  BKK 2017-3-1
//计算结果
// [{2016-12-31 16:00, 8}, {2017-2-28 17:00, 7}]
CrewBaseTimezoneIndex::CrewBaseTimezoneIndex(string crewId, vector<SharedPtr<CREW_BASE>>& crewBaseList, CrewDataContext* dataCtx) {
	this->crewId = crewId;

	if (crewBaseList.empty()) {
		Logger::getRuleLogger()->error("Fatal error, init CrewBaseTimezoneIndex fail, crewBaseList is empty crew={}", crewId);
	}

	//按eff排序
	std::stable_sort(crewBaseList.begin(), crewBaseList.end(), [](const SharedPtr<CREW_BASE> & a, const SharedPtr<CREW_BASE> & b) -> bool
	{
		return a->effUtc < b->effUtc;
	});

	time_t lastExpUtc = 0;
	double lastCrewBaseOffsetMinutes = NO_CREW_BASE_TIMEZONE;
	bool hasPrime = false;
	
	for (auto& cb : crewBaseList) {
		if (cb->isPrime) {
			hasPrime = true;
			if (cb->effUtc < lastExpUtc) {
				this->utcToOffsetMinutesSequence.erase(lastExpUtc);
			}

			this->utcToOffsetMinutesSequence[cb->effUtc] = dataCtx->getAirportOffsetMinutes(cb->base);
			//this->utcToOffsetSequence[cb->expUtc + 24 * 3600] = NO_CREW_BASE_TIMEZONE;
			lastExpUtc = cb->expUtc;
			lastCrewBaseOffsetMinutes = dataCtx->getAirportOffsetMinutes(cb->base);
		}
	}
	if (!hasPrime) {
		for (auto& cb : crewBaseList) {
			if (cb->effUtc < lastExpUtc) {
				this->utcToOffsetMinutesSequence.erase(lastExpUtc);
			}

			this->utcToOffsetMinutesSequence[cb->effUtc] = dataCtx->getAirportOffsetMinutes(cb->base);
			//this->utcToOffsetSequence[cb->expUtc + 24 * 3600] = NO_CREW_BASE_TIMEZONE;
			lastExpUtc = cb->expUtc;
			lastCrewBaseOffsetMinutes = dataCtx->getAirportOffsetMinutes(cb->base);
		}
	}
}

//完整index列表
const map<time_t, int>& CrewBaseTimezoneIndex::getIndex() {
	return utcToOffsetMinutesSequence;
}


map<time_t, int>::iterator CrewBaseTimezoneIndex::findUtcOffsetMinutesPair(time_t utc) {
	if (utcToOffsetMinutesSequence.empty()) {
		Logger::getRuleLogger()->error("CrewBaseTimezoneIndex fail, not init or no crew_base found crew={} utc={}", this->crewId, utcToUtcString(utc));
		throw "CrewBaseTimezoneIndex fail";
	}
	//utc < min
	if (utc < utcToOffsetMinutesSequence.begin()->first) {
		//避免console打印过多警告, 增加判断只打印较早时间的 no crew_base警告
		if (noCrewBaseWarnDt == 0 || noCrewBaseWarnDt > utc) {
			noCrewBaseWarnDt = utc;
			Logger::getRuleLogger()->error("ERROR: invalid data, no crew_base crew={} {}", crewId, utcToUtcString(utc));
		}
		//Logger::getRuleLogger()->error("getHourOffset fail");
		return utcToOffsetMinutesSequence.begin();
	}
	//min < utc < max
	map<time_t, int>::iterator it = utcToOffsetMinutesSequence.lower_bound(utc);
	if (it != utcToOffsetMinutesSequence.end() && utc > utcToOffsetMinutesSequence.begin()->first && utc < utcToOffsetMinutesSequence.rbegin()->first) {
		it--; //因 map.lower_bound会找到 it >= utc的item, 当 it > utc时向前移动it
	}
	//utc > max
	else if (it == utcToOffsetMinutesSequence.end()) {
		it--; //指向末尾: map.end() - 1
	}
	return it;
}
//计算utc对应crew base时区, 利用map.lower_bound查找
int CrewBaseTimezoneIndex::getOffsetMinutes(time_t utc) {
	auto it = findUtcOffsetMinutesPair(utc);
	return it->second;
}

//计算utc对应 local日期dayStart
time_t CrewBaseTimezoneIndex::getLocalDayStart(time_t utc) {
	int offsetMinutes = getOffsetMinutes(utc);
	time_t loc = utc + offsetMinutes * 60;
	return getStartTimeOfDay(loc);
}

//计算utc对应 local日期dayEnd
time_t CrewBaseTimezoneIndex::getLocalDayEnd(time_t utc) {
	auto it = findUtcOffsetMinutesPair(utc);
	time_t localStartOfDay = getStartTimeOfDay(utc + it->second * 60);
	string utcStr = utcToUtcString(utc);
	string localStartOfDayStr = utcToUtcString(localStartOfDay);
	//next item not exists
	auto next = it;
	next++;
	if (it == this->utcToOffsetMinutesSequence.end() || next == utcToOffsetMinutesSequence.end()) {
		return localStartOfDay + 24 * 3600 - 1; //23:59
	}
	//next item exists
	else {
		it++;
		time_t nextPeriodStart = it->first + it->second * 60;
		if (nextPeriodStart == localStartOfDay + 24 * 3600) {
			return nextPeriodStart - 1;
		}
		else {
			return localStartOfDay + 24 * 3600 - 1; //23:59
		}
	}
}

//按crew base切分local日期序列，每日0000~2359
void CrewBaseTimezoneIndex::computeLocalDayListInUtc(time_t startUtc, time_t endUtc, vector<pair<time_t, time_t>>& daysInUtc) {
	if (endUtc < startUtc) {
		Logger::getRuleLogger()->error("computeLocalDayListInUtc fail, invalid params startUtc > endUtc");
		return;
	}
	auto it = findUtcOffsetMinutesPair(startUtc);
	int currentOffsetMinutes = it->second;

	it++;
	time_t nextCrewBaseItemStartUtc = 0;
	time_t nextCrewBaseItemStartLoc = 0;
	time_t dayStartLoc = 0;
	time_t dayStartUtc = 0;
	time_t dayEndLoc = 0;
	time_t dayEndUtc = 0;
	time_t t = 0;
	
	if (it != utcToOffsetMinutesSequence.end()) {
		nextCrewBaseItemStartUtc = it->first;
		nextCrewBaseItemStartLoc = it->first + 60 * it->second;
	}
	else {
		nextCrewBaseItemStartUtc = LLONG_MAX;
		nextCrewBaseItemStartLoc = LLONG_MAX;
	}

	t = startUtc;
	do {

		dayStartLoc = getLocalDayStart(t);
		dayStartUtc = dayStartLoc - currentOffsetMinutes * 60;
		dayEndLoc = getLocalDayEnd(startUtc);

		if (nextCrewBaseItemStartLoc - dayStartLoc > 24 * 3600) {
			dayEndUtc = dayStartLoc + 24 * 3600 - currentOffsetMinutes * 60 - 1;

		}
		else {
			dayEndUtc = nextCrewBaseItemStartUtc - 1;
			currentOffsetMinutes = it->second;
			it++;//next crew_base
			if (it != utcToOffsetMinutesSequence.end()) {
				nextCrewBaseItemStartUtc = it->first;
				nextCrewBaseItemStartLoc = it->first + 60 * it->second;
			}
			else {
				nextCrewBaseItemStartUtc = LLONG_MAX;
				nextCrewBaseItemStartLoc = LLONG_MAX;
			}
		}
		daysInUtc.push_back(make_pair(dayStartUtc, dayEndUtc));
		t = dayEndUtc + 1;
	} while (dayStartUtc < endUtc);
}