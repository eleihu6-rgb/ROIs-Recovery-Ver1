#include <stdio.h>
#include <vector>

#include <algorithm>
#include <time.h>
#include "UtilFunc.h"
#include "CrewDB.h"
#include "CrewDBUtil.h"


using namespace std;


//根据参数计算 crewrank对象数值
//从db中存储的 loc date日期，按crewbase所在时区进行修正，修正结果按utc时刻赋值到对象中
void resetCrewRankByCrewBaseAndTimezone(SharedPtr<CREW_RANK>& crewrank, string crewId, string rank, time_t effDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx) {
	crewrank->rank = rank;

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

	crewrank->idCrew = crewId;
	crewrank->effUtc = effUtc;
	crewrank->expUtc = expUtc;
	crewrank->rank = rank;
}


void resetCrewRankByCrewBaseAndTimezone(SharedPtr<CREW_RANK>& crewrank, string crewId, string rank, time_t effDtStartLoc, time_t expDtStartLoc, SharedPtr<CrewDataContext> dataCtx) {
	crewrank->rank = rank;

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

	crewrank->idCrew = crewId;
	crewrank->effUtc = effUtc;
	crewrank->expUtc = expUtc;
	crewrank->rank = rank;
}

void resetCrewCompanyRankByCrewBaseAndTimezone(SharedPtr<CREW_COMPANY_RANK>& crewCompanyRank, string crewId, string rank, time_t effDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx) {
	crewCompanyRank->companyRank = rank;

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

	crewCompanyRank->idCrew = crewId;
	crewCompanyRank->effDt = effUtc;
	crewCompanyRank->expDt = expUtc;
	crewCompanyRank->companyRank = rank;
}

void resetCrewGuaranteeHourByCrewBaseAndTimezone(SharedPtr<CREW_GUARANTEE_HOUR>& crewGuaranteeHour, time_t effDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx) {

	time_t effLoc = getStartTimeOfDay(effDtStartLoc);
	time_t expLoc = (expDtStartLoc == -1) ? utcStrToUtc("9999-12-31") : getStartTimeOfDay(expDtStartLoc) + 24 * 3600 - 1;  //exp: end of day

	int offsetMinuteEff = dataCtx->getCrewBaseOffsetMinutes(crewGuaranteeHour->idCrew, effDtStartLoc);
	int offsetMinuteExp = dataCtx->getCrewBaseOffsetMinutes(crewGuaranteeHour->idCrew, expDtStartLoc);

	time_t effUtc = effLoc - offsetMinuteEff * 60;
	time_t expUtc = expLoc - offsetMinuteExp * 60;

	if (expDtStartLoc == utcStrToUtc("9999-12-31")) {
		expUtc = utcStrToUtc("9999-12-31");
	}

	crewGuaranteeHour->effDt = effUtc;
	crewGuaranteeHour->expDt = expUtc;
}

void resetCrewStatusByCrewBaseAndTimezone(SharedPtr<CREW_STATUS>& crewStatus, time_t effDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx) {

	time_t effLoc = getStartTimeOfDay(effDtStartLoc);
	time_t expLoc = (expDtStartLoc == -1) ? utcStrToUtc("9999-12-31") : getStartTimeOfDay(expDtStartLoc) + 24 * 3600 - 1;  //exp: end of day

	int offsetMinuteEff = dataCtx->getCrewBaseOffsetMinutes(crewStatus->idcrew, effDtStartLoc);
	int offsetMinuteExp = dataCtx->getCrewBaseOffsetMinutes(crewStatus->idcrew, expDtStartLoc);

	time_t effUtc = effLoc - offsetMinuteEff * 60;
	time_t expUtc = expLoc - offsetMinuteExp * 60;

	if (expDtStartLoc == utcStrToUtc("9999-12-31")) {
		expUtc = utcStrToUtc("9999-12-31");
	}

	crewStatus->effDt = effUtc;
	crewStatus->expdt = expUtc;
}

void resetCrewFlyTogetherByCrewBaseAndTimezone(SharedPtr<CREW_FLY_TOGETHER>& crewFlyTogether, time_t effDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx) {

	time_t effLoc = getStartTimeOfDay(effDtStartLoc);
	time_t expLoc = (expDtStartLoc == -1) ? utcStrToUtc("9999-12-31") : getStartTimeOfDay(expDtStartLoc) + 24 * 3600 - 1;  //exp: end of day

	int offsetMinuteEff = dataCtx->getCrewBaseOffsetMinutes(crewFlyTogether->crewIdA, effDtStartLoc);
	int offsetMinuteExp = dataCtx->getCrewBaseOffsetMinutes(crewFlyTogether->crewIdA, expDtStartLoc);

	time_t effUtc = effLoc - offsetMinuteEff * 60;
	time_t expUtc = expLoc - offsetMinuteExp * 60;

	if (expDtStartLoc == utcStrToUtc("9999-12-31")) {
		expUtc = utcStrToUtc("9999-12-31");
	}

	crewFlyTogether->effectiveDate = effUtc;
	crewFlyTogether->expiryDate = expUtc;
}

void resetCrewFlyPreferencByCrewBaseAndTimezone(SharedPtr<CREW_FLY_PREFERENCE>& crewFlyPreference, time_t effDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx) {

	time_t effLoc = getStartTimeOfDay(effDtStartLoc);
	time_t expLoc = (expDtStartLoc == -1) ? utcStrToUtc("9999-12-31") : getStartTimeOfDay(expDtStartLoc) + 24 * 3600 - 1;  //exp: end of day

	int offsetMinuteEff = dataCtx->getCrewBaseOffsetMinutes(crewFlyPreference->crewId, effDtStartLoc);
	int offsetMinuteExp = dataCtx->getCrewBaseOffsetMinutes(crewFlyPreference->crewId, expDtStartLoc);

	time_t effUtc = effLoc - offsetMinuteEff * 60;
	time_t expUtc = expLoc - offsetMinuteExp * 60;

	if (expDtStartLoc == utcStrToUtc("9999-12-31")) {
		expUtc = utcStrToUtc("9999-12-31");
	}

	crewFlyPreference->effectiveDate = effUtc;
	crewFlyPreference->expiryDate = expUtc;
}

void resetCrewPreferenceByCrewBaseAndTimezone(SharedPtr<CREW_PREFERENCE>& crewPreference, time_t effDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx) {
	crewPreference->strDtloc = getStartTimeOfDay(effDtStartLoc);
	crewPreference->endDtLoc = (expDtStartLoc == -1) ? utcStrToUtc("9999-12-31") : getStartTimeOfDay(expDtStartLoc) + 24 * 3600 - 1;  //exp: end of day
}

void resetCrewEntitlementByCrewBaseAndTimezone(SharedPtr<CREW_ENTITLEMENT>& crewEntitlement, time_t effDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx) {

	time_t effLoc = getStartTimeOfDay(effDtStartLoc);
	time_t expLoc = (expDtStartLoc == -1) ? utcStrToUtc("9999-12-31") : getStartTimeOfDay(expDtStartLoc) + 24 * 3600 - 1;  //exp: end of day

	int offsetMinuteEff = dataCtx->getCrewBaseOffsetMinutes(crewEntitlement->crewId, effDtStartLoc);
	int offsetMinuteExp = dataCtx->getCrewBaseOffsetMinutes(crewEntitlement->crewId, expDtStartLoc);

	time_t effUtc = effLoc - offsetMinuteEff * 60;
	time_t expUtc = expLoc - offsetMinuteExp * 60;

	if (expDtStartLoc == utcStrToUtc("9999-12-31")) {
		expUtc = utcStrToUtc("9999-12-31");
	}

	crewEntitlement->effDt = effUtc;
	crewEntitlement->expDt = expUtc;
}

void resetCrewProfileByCrewBaseAndTimezone(SharedPtr<CREW_PROFILE>& crewProfile, time_t effDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx) {

	time_t effLoc = getStartTimeOfDay(effDtStartLoc);
	time_t expLoc = (expDtStartLoc == -1) ? utcStrToUtc("9999-12-31") : getStartTimeOfDay(expDtStartLoc) + 24 * 3600 - 1;  //exp: end of day

	int offsetMinuteEff = dataCtx->getCrewBaseOffsetMinutes(crewProfile->crewId, effDtStartLoc);
	int offsetMinuteExp = dataCtx->getCrewBaseOffsetMinutes(crewProfile->crewId, expDtStartLoc);

	time_t effUtc = effLoc - offsetMinuteEff * 60;
	time_t expUtc = expLoc - offsetMinuteExp * 60;

	if (expDtStartLoc == utcStrToUtc("9999-12-31")) {
		expUtc = utcStrToUtc("9999-12-31");
	}

	crewProfile->effDt = effUtc;
	crewProfile->expDt = expUtc;
}

//合并CrewRank, 要求rank/position相同, 且时间段衔接
//1 循环，对每一item寻找向后衔接的item
//2 若存在, 则将后一个item累加到前一个，并移除后一个item
//3 直到找不到下一个可合并为止
void mergeCrewRank(vector<SharedPtr<CREW_RANK>>& list) {
	//20181017 ain, list为空时忽略, 避免for循环 i < 0 - 1不退出问题
	if (list.size() == 0) {
		return;
	}
	bool hasMore = true;
	while (hasMore) {
		bool found = false;
		for (std::size_t i = 0; i + 1 < list.size(); i++) {
			for (std::size_t j = i + 1; j < list.size(); j++) {
				SharedPtr<CREW_RANK> p = list[i];
				SharedPtr<CREW_RANK> q = list[j];
				if (p->rank == q->rank && p->position == q->position && p->idCrew == q->idCrew
					&&p->fleetGroup == q->fleetGroup
					&&p->acType == q->acType) {
					if (p->effUtc <= q->expUtc + 24 * 3600 && q->effUtc <= p->expUtc + 24 * 3600) {
						found = true;
						p->effUtc = min(p->effUtc, q->effUtc);
						p->expUtc = max(p->expUtc, q->expUtc);
						//20181230 ain, OP#1896, 合并前preCumulatedExpDays已经反应全部历史天数，所以合并后以exp较大的为准
						p->preCumulatedExpDays = max(p->preCumulatedExpDays, q->preCumulatedExpDays);
						list.erase(list.begin() + j);
						break;
					}
				}
			}
			if (found) break;
		}
		if (!found) {
			hasMore = false;
		}
	}
}


//合并CrewCompanyRank, 要求rank/position相同, 且时间段衔接
//1 循环，对每一item寻找向后衔接的item
//2 若存在, 则将后一个item累加到前一个，并移除后一个item
//3 直到找不到下一个可合并为止
void mergeCrewCompanyRank(vector<SharedPtr<CREW_COMPANY_RANK>>& list) {
	//20181017 ain, list为空时忽略, 避免for循环 i < 0 - 1不退出问题
	if (list.size() == 0) {
		return;
	}
	bool hasMore = true;
	while (hasMore) {
		bool found = false;
		for (std::size_t i = 0; i + 1 < list.size(); i++) {
			for (std::size_t j = i + 1; j < list.size(); j++) {
				SharedPtr<CREW_COMPANY_RANK> p = list[i];
				SharedPtr<CREW_COMPANY_RANK> q = list[j];
				if (p->companyRank == q->companyRank && p->idCrew == q->idCrew //&& p->companyPosition == q->companyPosition
					&& p->fleetSpecific == q->fleetSpecific
					&& p->acType == q->acType) {
					if (p->effDt <= q->expDt + 24 * 3600 && q->effDt <= p->expDt + 24 * 3600) {
						found = true;
						p->effDt = min(p->effDt, q->effDt);
						p->expDt = max(p->expDt, q->expDt);
						//20181230 ain, OP#1896, 合并前preCumulatedExpDays已经反应全部历史天数，所以合并后以exp较大的为准
						p->preCumulatedExpDays = max(p->preCumulatedExpDays, q->preCumulatedExpDays);
						list.erase(list.begin() + j);
						break;
					}
				}
			}
			if (found) break;
		}
		if (!found) {
			hasMore = false;
		}
	}
}