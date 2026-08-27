#include <stdio.h>
#include <vector>

#include <time.h>
#include "UtilFunc.h"
#include "CrewDB.h"
#include "CrewDBUtil.h"


using namespace std;


//根据参数计算 crewfleet对象数值
//从db中存储的 loc date日期，按crewbase所在时区进行修正，修正结果按utc时刻赋值到对象中
void resetCrewFleetByCrewBaseAndTimezone(SharedPtr<CREW_FLEET>& crewfleet, string crewId, string fleet, time_t effDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx) {
	crewfleet->fleet = fleet;

	time_t effLoc = getStartTimeOfDay(effDtStartLoc);
	time_t expLoc = (expDtStartLoc == -1) ? utcStrToUtc("9999-12-31") : getStartTimeOfDay(expDtStartLoc) + 24 * 3600 - 1;  //exp: end of day


	int offsetMinuteEff = dataCtx->getCrewBaseOffsetMinutes(crewId, effDtStartLoc);
	int offsetMinuteExp = dataCtx->getCrewBaseOffsetMinutes(crewId, expDtStartLoc);

	time_t effUtc = effLoc - offsetMinuteEff * 60;
	time_t expUtc = expLoc - offsetMinuteExp * 60;

	//20180212 ain, mantis#2846, 9999-12-31为特殊时间, 表示未指定expUtc, 不做调整
	if (expDtStartLoc == utcStrToUtc("9999-12-31")) {
		expUtc = utcStrToUtc("9999-12-31");
	}

	crewfleet->idCrew = crewId;
	crewfleet->effUtc = effUtc;
	crewfleet->expUtc = expUtc;
	crewfleet->fleet = fleet;
}

