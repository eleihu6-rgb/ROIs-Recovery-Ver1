#include <stdio.h>
#include <vector>

#include <time.h>
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "TestDBFunc.h"
#include "UtilFunc.h"


using namespace std;


//根据参数计算 crewrank对象数值
//从db中存储的 loc date日期，按crewbase所在时区进行修正，修正结果按utc时刻赋值到对象中
void resetCrewTeamByCrewBaseAndTimezone(SharedPtr<CREW_TEAM>& item, time_t effDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx) {

	time_t effLoc = getStartTimeOfDay(effDtStartLoc);
	time_t expLoc = (expDtStartLoc == -1) ? utcStrToUtc("9999-12-31") : getStartTimeOfDay(expDtStartLoc) + 24 * 3600 - 1;  //exp: end of day

	int offsetMinuteEff = dataCtx->getCrewBaseOffsetMinutes(item->idcrew, effDtStartLoc);
	int offsetMinuteExp = dataCtx->getCrewBaseOffsetMinutes(item->idcrew, expDtStartLoc);

	time_t effUtc = effLoc - offsetMinuteEff * 60;
	time_t expUtc = expLoc - offsetMinuteExp * 60;

	//20180212 ain, mantis#2846, 9999-12-31为特殊时间, 表示未指定expUtc, 不做调整
	if (expDtStartLoc == utcStrToUtc("9999-12-31")) {
		expUtc = utcStrToUtc("9999-12-31");
	}

	item->effDt = effUtc;
	item->expDt = expUtc;
}
