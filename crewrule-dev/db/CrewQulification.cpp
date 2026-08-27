#include <stdio.h>
#include <vector>

#include <time.h>
#include <iostream>
#include <algorithm>
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "UtilFunc.h"
#include "Utility.h"


using namespace std;

//根据crewbase计算 crewqual对象时间数值
//从db中存储的 loc date日期，按crewbase所在时区进行修正，修正结果按utc时刻赋值到对象中
void resetCrewQualTimeByCrewBaseAndTimezone(SharedPtr<CREW_QUALIFICATION>& crewqual, string crewId, time_t issuedDtStartLoc, time_t renewDtStartLoc, time_t cancelDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx, time_t earliestDtStartLoc, time_t latestDtStartLoc, time_t baseMonthStartLoc) {

	time_t issuedLoc = getStartTimeOfDay(issuedDtStartLoc);
	time_t renewLoc = getStartTimeOfDay(renewDtStartLoc);
	time_t cancelLoc = getStartTimeOfDay(cancelDtStartLoc);
	time_t expLoc = (expDtStartLoc == -1) ? utcStrToUtc("9999-12-31") : getStartTimeOfDay(expDtStartLoc) + 24 * 3600 - 1;  //exp: end of day
	time_t earliestLoc = (earliestDtStartLoc <= 0) ? 0 : getStartTimeOfDay(earliestDtStartLoc);
	time_t latestLoc = (latestDtStartLoc == 0) ? utcStrToUtc("9999-12-31") : getStartTimeOfDay(latestDtStartLoc) + 24 * 3600 - 1; //end of day
	time_t baseMonthLoc = (baseMonthStartLoc == 0) ? 0 : getStartTimeOfDay(baseMonthStartLoc);

	int offsetMinutesIssued = dataCtx->getCrewBaseOffsetMinutes(crewId, issuedLoc);
	int offsetMinutesRenew = dataCtx->getCrewBaseOffsetMinutes(crewId, renewLoc);
	int offsetMinutesCancel = dataCtx->getCrewBaseOffsetMinutes(crewId, cancelLoc);
	int offsetMinutesExp = dataCtx->getCrewBaseOffsetMinutes(crewId, expLoc);
	int offsetMinutesEarliest = dataCtx->getCrewBaseOffsetMinutes(crewId, earliestLoc);
	int offsetMinutesLatest = dataCtx->getCrewBaseOffsetMinutes(crewId, latestLoc);

	time_t issuedUtc = issuedLoc - offsetMinutesIssued * 60;
	time_t renewUtc = renewLoc - offsetMinutesRenew * 60;
	time_t cancelUtc = cancelLoc - offsetMinutesCancel * 60;
	time_t expUtc = expLoc - offsetMinutesExp * 60;
	time_t earliestUtc = earliestLoc - offsetMinutesEarliest * 60;
	time_t latestUtc = latestLoc - offsetMinutesLatest * 60;
	time_t baseMonthStartUtc = baseMonthLoc - offsetMinutesLatest * 60;
	auto baseMonthEndUtc = Utility::GetInstancePtr()->getLocalMonthEndInUTC(baseMonthStartUtc, offsetMinutesLatest);

	crewqual->issuedUtc = issuedUtc;
	crewqual->renewedUtc = renewUtc;
	crewqual->cancelUtc = cancelUtc;
	crewqual->expiryUtc = expUtc;
	crewqual->earliestUtc = earliestUtc;
	crewqual->latestUtc = latestUtc;
	crewqual->baseMonthStartUtc = baseMonthStartUtc;
	crewqual->baseMonthEndUtc = baseMonthEndUtc;
}


//合并CrewQualification, 要求qualification相同, 且时间段衔接
//1 循环，对每一item寻找向后衔接的item
//2 若存在, 则将后一个item累加到前一个，并移除后一个item
//3 直到找不到下一个可合并为止
void mergeCrewQualification(vector<SharedPtr<CREW_QUALIFICATION>>& list) {
	//20181017 ain, list为空时忽略, 避免for循环 i < 0 - 1不退出问题
	if (list.size() == 0) {
		return;
	}
	bool hasMore = true;
	while (hasMore) {
		bool found = false;
		for (std::size_t i = 0; i + 1 < list.size(); i++) {
			for (std::size_t j = i + 1; j < list.size(); j++) {
				SharedPtr<CREW_QUALIFICATION> p = list[i];
				SharedPtr<CREW_QUALIFICATION> q = list[j];
				if (p->qual == q->qual && p->idCrew == q->idCrew
					&& p->rank == q->rank
					&& p->acType == q->acType
					&& p->fleetGrp == q->fleetGrp
					&& p->languageLevel == q->languageLevel) {
					if (p->issuedUtc <= q->expiryUtc + 24 * 3600 && q->issuedUtc <= p->expiryUtc + 24 * 3600) {
						found = true;
						p->issuedUtc = min(p->issuedUtc, q->issuedUtc);
						p->expiryUtc = max(p->expiryUtc, q->expiryUtc);
						p->isValid = p->isValid ? p->isValid : q->isValid;
						//20181230 ain, OP#1896, 合并前preCumulatedExpDays已经反应全部历史天数，所以合并后以exp较大的为准
						//p->preCumulatedExpDays = max(p->preCumulatedExpDays, q->preCumulatedExpDays);
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

vector<SharedPtr<CREW_QUALIFICATION>> getCrewQualificationMergeByRuleParam(const vector<SharedPtr<CREW_QUALIFICATION>>& list, const vector<string>& ruleParamQualifications) {
	vector<SharedPtr<CREW_QUALIFICATION>> result;

	if (list.size() == 0) {
		return result;
	}
	for (std::size_t i = 0; i < list.size(); i++) {
		SharedPtr<CREW_QUALIFICATION> p = list[i];
		//SharedPtr<CREW_QUALIFICATION> qual = make_shared<CREW_QUALIFICATION>(p);
		shared_ptr<CREW_QUALIFICATION> qual(new CREW_QUALIFICATION(*p));
		result.push_back(qual);
		for (std::size_t j = i + 1; j < list.size(); j++) {	
			SharedPtr<CREW_QUALIFICATION> q = list[j];
			if (find(ruleParamQualifications.begin(), ruleParamQualifications.end(), p->qual) != ruleParamQualifications.end() && p->idCrew == q->idCrew
				&& p->rank == q->rank
				&& p->acType == q->acType
				&& p->fleetGrp == q->fleetGrp
				&& p->languageLevel == q->languageLevel) {
				if (p->issuedUtc <= q->expiryUtc + 24 * 3600 && q->issuedUtc <= p->expiryUtc + 24 * 3600) {
					qual->issuedUtc = min(qual->issuedUtc, q->issuedUtc);
					qual->expiryUtc = max(qual->expiryUtc, q->expiryUtc);
					qual->isValid = qual->isValid ? qual->isValid : q->isValid;
				}
			}
		}
	}
	return result;
}