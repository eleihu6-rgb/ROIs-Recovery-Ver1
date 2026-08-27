#include <stdio.h>
#include <vector>
#include <algorithm>

#include <iostream>
#include <time.h>
#include "UtilFunc.h"
#include "CrewDB.h"
#include "CrewDBUtil.h"


using namespace std;
//根据参数计算 crewBase对象数值
//从db中存储的 loc date日期，按crewbase所在时区进行修正，修正结果按utc时刻赋值到对象中
void resetCrewBaseByBaseAndTimezone(SharedPtr<CREW_BASE>& crewbase, string crewId, string base, time_t effDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx) {
	crewbase->base = base;
	try {
		time_t effLoc = getStartTimeOfDay(effDtStartLoc);
		time_t expLoc = (expDtStartLoc == -1 || expDtStartLoc >= utcStrToUtc("9999-1-1")) ? utcStrToUtc("9999-12-31") : getStartTimeOfDay(expDtStartLoc) + 24 * 3600 - 1; //exp: end of day

		auto offsetMinute = dataCtx->getAirportOffsetMinutes(base);

		time_t effUtc = effLoc - offsetMinute * 60;
		time_t expUtc = expLoc - offsetMinute * 60;

		crewbase->idCrew = crewId;
		crewbase->effUtc = effUtc;
		crewbase->expUtc = expUtc;
		crewbase->effLoc = effLoc;
		crewbase->expLoc = expLoc;
		crewbase->base = base;
	}
	catch (...) {
		Logger::getRuleLogger()->error("[resetCrewBaseByBaseAndTimezone] EXCEPTION: invalid data, set crew_base fail, crew {} base={} {}", crewId, base, utcToUtcString(effDtStartLoc));
	}
}
