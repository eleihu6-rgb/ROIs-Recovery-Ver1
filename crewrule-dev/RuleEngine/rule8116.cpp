#include "RuleEngine.h"
#include "Utility.h"

#include <time.h>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
// #include "orlog.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "utils/StringUtils.h"
// #include "customBiz\customBiz.h"
#include "CustomBiz/CustomBiz.h"
#include "RuleParams.h"



// 8116 货航驻外最长天数限制
bool LegalityChecker::checkMaxAbroadDays(RULE_LEGALITY * pCrew) {
	bool isValid = true;
	if (!pCrew) {
		return true;
	}
	if (this->GetApplication() == PAIRING_OPTIMIZER) {
		return true;
	}
	shared_ptr<CREW>& crew = _dbData->crewList[pCrew->crewIndex];
	if (!crew || crew->rosterList.empty()) {
		return true;
	}

	const vector<DBRule>& dutyBuilder = this->_dbData->getRuleFunctions(RULES::MAX_ABROAD_DAYS);
	if (dutyBuilder.size() == 0) {
		return true;
	}
	vector<Duty*> dutyVec;

	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	time_t dutyEndUtc = 0;
	for (auto rule : dutyBuilder) {
		rule8116* cache = (rule8116*)rule.parsedParam.get();
		time_t lCheckedStart = rosters[0]->getStartTimeUtcAct(), lCheckedEnd = rosters[rosters.size() - 1]->getRestStartUtcAct();
		if (!Utility::GetInstancePtr()->isCrewQualified(crew, cache->base, cache->rank, cache->fleet, cache->team, "*", lCheckedStart, lCheckedEnd)) {
			return true;
		}
		string base = Utility::GetInstancePtr()->getCrewPrimaryBase(crew->baseList, _dbData->scenario.startDtUTC);
		auto CrewBaseOffsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
		
		time_t startUtc = 0;
		time_t endUtc = 0;
		string endArp;
		int unit = 0;
		if (cache->Unit == "CD") {
			unit = 1;
		}

		bool isAllPreassigned = true;
		for (std::size_t i = 0; i < rosters.size(); i++) {
			
			if (rosters[i]->pairId && (rosters[i]->duty == "FLY" || rosters[i]->duty == "MVP" || rosters[i]->duty == "MVO")) {
				vector<Duty*> dutys = rosters[i]->pairing->getDutyVec();
				for (std::size_t j = 0; j < dutys.size(); j++) {

					vector<Segment*> segments = dutys[j]->getSegments();

					for (std::size_t k = 0; k < segments.size(); k++) {

						Segment* segment = segments[k];

						if (startUtc != 0) {

							if (endArp == base) {
								if (i > 0 && (rosters[i - 1]->duty == "MVP" || rosters[i - 1]->duty == "MVO") && (rosters[i]->duty == "MVP" || rosters[i]->duty == "MVO") && (segment->getStartTimeUtc("ACT") - endUtc) >= cache->ignoreReturnBase * unit * (24 * 3600)) {
									if (this->GetApplication() == ROSTER_OPTIMIZER && isAllPreassigned == false && !check8116(startUtc, endUtc, rule, crew, CrewBaseOffsetMinutes)) {
										isValid = false;
										pCrew->isLegal = false;
									}
									else if (this->GetApplication() != ROSTER_OPTIMIZER && !check8116(startUtc, endUtc, rule, crew, CrewBaseOffsetMinutes)) {
										isValid = false;
										pCrew->isLegal = false;
									}

									if (rosters[i]->source != "PA")
										isAllPreassigned = false;
									else
										isAllPreassigned = true;
									startUtc = segment->getStartTimeUtc("ACT");
								}
								else if (i > 0 && !((rosters[i - 1]->duty == "MVP" || rosters[i - 1]->duty == "MVO") && (rosters[i]->duty == "MVP" || rosters[i]->duty == "MVO"))){
									if (this->GetApplication() == ROSTER_OPTIMIZER && isAllPreassigned == false && !check8116(startUtc, endUtc, rule, crew, CrewBaseOffsetMinutes)) {
										isValid = false;
										pCrew->isLegal = false;
									}
									else if (this->GetApplication() != ROSTER_OPTIMIZER && !check8116(startUtc, endUtc, rule, crew, CrewBaseOffsetMinutes)) {
										isValid = false;
										pCrew->isLegal = false;
									}

									if (rosters[i]->source != "PA")
										isAllPreassigned = false;
									else
										isAllPreassigned = true;
									startUtc = segment->getStartTimeUtc("ACT");
								}
							}
						}
						else {
							if (rosters[i]->source != "PA")
								isAllPreassigned = false;
							else
								isAllPreassigned = true;

							startUtc = segment->getStartTimeUtc("ACT");
							if (base != segment->getDepSta()) {
								startUtc = startUtc - (cache->defaultOutOfBase * unit * (24 * 3600));
							}
						}
						endUtc = segment->getEndTimeUtc("ACT");
						endArp = segment->getArrSta();
						if (rosters[i]->source != "PA")
							isAllPreassigned = false;
					}
				}
			}
		}
		if (endArp != base) {
			endUtc = endUtc + (cache->defaultReturnBase * unit * (24 * 3600));
		}
		if (this->GetApplication() == ROSTER_OPTIMIZER && isAllPreassigned == false && !check8116(startUtc, endUtc, rule, crew, CrewBaseOffsetMinutes)) {
			isValid = false;
			pCrew->isLegal = false;
		}
		else if (this->GetApplication() != ROSTER_OPTIMIZER && !check8116(startUtc, endUtc, rule, crew, CrewBaseOffsetMinutes)) {
			isValid = false;
			pCrew->isLegal = false;
		}
	}
	return isValid;
}

bool LegalityChecker::check8116(time_t start, time_t end, const DBRule& rule, shared_ptr<CREW>& crew, int offsetMinutes) {

	rule8116* cache = (rule8116*)rule.parsedParam.get();


	int startDay = static_cast<int>((start + offsetMinutes * 60) / (24 * 3600));
	int endDay = static_cast<int>((end + offsetMinutes * 60) / (24 * 3600));

	int unit = 0;
	if (cache->Unit == "CD") {
		unit = 1;
	}
	if (endDay - startDay <= cache->maxAbroadDays * unit) {
		return true;
	}
	else {
		string errorMsg = "The actual abroad days ({0:actualAbroadingDays}) exceeds the maximum allowed abroad days ({1:maxAbroadDays}).";
		errorMsg = StringUtils::Format(errorMsg, (endDay - startDay), cache->maxAbroadDays);
		RULE_VIOLATION* rv = new RULE_VIOLATION();
		rv->crewId = crew->idCrew;
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
		rv->startDTUtc = start;
		rv->endDTUtc = end;
		rv->violation_msg = errorMsg;
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
		rv->operation_result.insert(pair<string, string>("ActualAbroadTime", Utility::GetInstancePtr()->ToString(endDay - startDay)));
		rv->operation_result.insert(pair<string, string>("MaxAbroadTime", Utility::GetInstancePtr()->ToString(cache->maxAbroadDays)));
		this->addRuleViolations(rv, &rule);
		return false;
	}
	return true;
}
