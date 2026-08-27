/**
 * @file CheckImplausibleConnectionsRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2024-11-19
**/


#include <algorithm>

#include "../RuleSytem.h"
#include "CheckImplausibleConnectionsRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"

bool CheckImplausibleConnectionsRule::CheckRule(const Pairing* pairing) const {
	
	bool passAllRule = true;
	string lastArrive = "";
	time_t lastArrTime = 0;

	_ruleViolation.SetRuleParam(*_ruleParam);
	for (const auto& duty : pairing->getDutyVec()) {
		for (const auto& seg : duty->getSegments()) {
			bool exceptionAssignment = false;
			for (const auto& assignmentRuleParam : _ruleParam->GetAssignmentParams()) {
				if (assignmentRuleParam.MatchAssignment(seg->getAssignment())) {
					exceptionAssignment = true;
					break;
				}
			}
			if (exceptionAssignment)
				continue;
			if (lastArrive == "") {
				lastArrive = seg->getArrStation();
				lastArrTime = seg->getEndTimeUtcAct();
			}
			else {
				if (lastArrive != seg->getDepStation()) {
					bool isNoWarningPair = false;
					
					for (const auto& airportRuleParam : _ruleParam->GetAirportParams()) {
						auto range = airportRuleParam._noWarningAirportPairs.equal_range(lastArrive);
						for (auto i = range.first; i != range.second; ++i) {
							if (i->second == seg->getDepStation()) {
								isNoWarningPair = true; break;
							}
						}
					}

					if (isNoWarningPair)
						continue;

					if (isNoWarningPair) {
						lastArrive = seg->getArrStation();
						lastArrTime = seg->getEndTimeUtcAct();
						continue;

					}
					_ruleViolation.SetParam("start", to_string(lastArrTime));
					_ruleViolation.SetParam("end", to_string(seg->getStartTimeUtcAct()));
					ThrowRuleViolation(pairing, seg->getSegmentId(), lastArrive, seg->getDepStation());
					passAllRule = false;
				}
				else {
					lastArrive = seg->getArrStation();
					lastArrTime = seg->getEndTimeUtcAct();
				}
			}
		}
	}
	
	
	return passAllRule;
}

bool CheckImplausibleConnectionsRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {

	if (rosters.empty()) {
		return true;
	}

	bool passAllRule = true;
	bool next = true;
	string lastArrive = "";
	time_t lastArrTime = 0;
	bool lastRosterIsPA = false;
	_ruleViolation.SetRuleParam(*_ruleParam);
    const ROSTER* prevRoster = nullptr;
    int rosterIndex = 0;
    std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];

	for (auto& roster : rosters) {

        //优化忽略特殊的预占违规
        if (this->_application == ROSTER_OPTIMIZER && prevRoster != nullptr && prevRoster->source == "PA" && roster->source == "PA") {
            rosterIndex++;
			if (roster->pairing) {
				bool exceptionAssignment = false;
				for (const auto& assignmentRuleParam : _ruleParam->GetAssignmentParams()) {
					if (assignmentRuleParam.MatchAssignment(roster->pairing->getLastSegment()->getAssignment())) {
						exceptionAssignment = true;
						break;
					}
				}
				if (!exceptionAssignment){
					lastArrive = roster->pairing->getEndArp();
					lastArrTime = roster->pairing->getLastSegment()->getEndTimeUtcAct();
					prevRoster = roster;
				}
			}
			else {
				bool exceptionAssignment = false;
				for (const auto& assignmentRuleParam : _ruleParam->GetAssignmentParams()) {
					if (assignmentRuleParam.MatchAssignment(roster->qualifier)) {
						exceptionAssignment = true;
						break;
					}
				}
				if (!exceptionAssignment){
					lastArrive = roster->location;
					lastArrTime = roster->actEndUtc;
					prevRoster = roster;
				}
			}
            continue;

            //如果一个预占roster时间区间完全落在另一个预占roster时间区间内，直接忽略
            /*if(roster->actStrUtc >= prevRoster->actStrUtc && roster->actEndUtc <= prevRoster->actEndUtc) {
                prevRoster = roster;
                rosterIndex++;
                continue;
            }*/

            //如果一个roster在优化场景开始前结束，并且当前roster不是最后一个，并且下一个roster开始也早于优化场景开始时间，直接忽略
            /*if(roster->actEndUtc <= this->_dbData->scenario.startDtUTC && rosterIndex < (int)rosters.size() - 1){
                if(rosters[rosterIndex + 1]->actStrUtc <= this->_dbData->scenario.startDtUTC) {
                    prevRoster = roster;
                    rosterIndex++;
                    continue;
                }
            }*/

            //如果当前预占roster的开始时间与前面预占roster的时间重叠，并且当前预占roster的结束时间晚于前面roster结束时间，并且当前roster回到组员基地，直接忽略
            /*if(roster->actEndUtc > prevRoster->actEndUtc && roster->pairing->getLastSegment()->getArrSta() == crew->getPrimeBase()){
                bool skipCheck = false;
                for(int j = rosterIndex - 1; j >= 0; j--){
                    if(roster->actStrUtc >= rosters[j]->actStrUtc && roster->actStrUtc <= rosters[j]->actEndUtc && rosters[j]->source == "PA") {
                        skipCheck = true;
                    }

                    if (roster->actStrUtc >= rosters[j]->actEndUtc)
                        break;
                }
                if(skipCheck) {
                    prevRoster = roster;
                    rosterIndex++;
                    continue;
                }
            }*/
        }
		
		if (roster->pairing) {
			const auto& duties = roster->pairing->getDutyVec();
			for (size_t i = 0; i <= duties.size() - 1; i++) {
				const auto& segments = duties[i]->getSegments();
				for (size_t j = 0; j <= segments.size() - 1; j++) {
					bool exceptionAssignment = false;
					for (const auto& assignmentRuleParam : _ruleParam->GetAssignmentParams()) {
						if (assignmentRuleParam.MatchAssignment(segments[j]->getAssignment())) {
							exceptionAssignment = true;
							break;
						}
					}
					if (exceptionAssignment)
						continue;
					if (lastArrive != "" && lastArrive != segments[j]->getDepStation()) {
						bool isNoWarningPair = false;
							
						for (const auto& airportRuleParam : _ruleParam->GetAirportParams()) {
							auto range = airportRuleParam._noWarningAirportPairs.equal_range(lastArrive);
							for (auto i = range.first; i != range.second; ++i) {
								if (i->second == segments[j]->getDepStation()) {
									isNoWarningPair = true; break;
								}
							}
						}

						if (isNoWarningPair) {
							lastArrive = segments[j]->getArrStation();
							lastArrTime = segments[j]->getEndTimeUtcAct();
							continue;
						}

                        //对于RO来说，只检查任务环之间是否衔接，不检查任务环内部。所以只检查任务环第一个duty的第一个seg和前面seg是否合规
                        if(this->_application == ROSTER_OPTIMIZER && !(i == 0 && j == 0))
                            isNoWarningPair = true;
						
						if (isNoWarningPair) {
							lastArrive = segments[j]->getArrStation();
							lastArrTime = segments[j]->getEndTimeUtcAct();
							
							continue;
						}
						_ruleViolation.SetParam("start", to_string(lastArrTime));
						_ruleViolation.SetParam("end", to_string(segments[j]->getStartTimeUtcAct()));
						/*
						* 预占判断逻辑：
						* 当前任务是PA，则任务内的不连续不告警
						* 当前任务是PA，且第一个航班和前一个任务的结束不连续，如果前一个任务是PA，则不告警，反之则告警
						*/
						bool isPa = false;
						if (this->_application == ROSTER_OPTIMIZER) {
							if (roster->source == "PA") {
								if (i != 0 || j != 0)
									isPa = true;
								else if (lastRosterIsPA)
									isPa = true;
							}
						}
						
						if (!isPa) {
							if (this->_application == ROSTER_OPTIMIZER)
								return false;
							ThrowRuleViolationForRoster(roster, segments[j]->getSegmentId(), lastArrive, segments[j]->getDepStation());
							passAllRule = false;

						}
						
					}
					lastArrive = segments[j]->getArrStation();
					lastArrTime = segments[j]->getEndTimeUtcAct();
					
				}
			}
		}
		else {
			bool exceptionAssignment = false;
			for (const auto& assignmentRuleParam : _ruleParam->GetAssignmentParams()) {
				if (assignmentRuleParam.MatchAssignment(roster->qualifier)) {
					exceptionAssignment = true;
					break;
				}
			}
			if (exceptionAssignment)
				continue;
			if (lastArrive != "" && lastArrive != roster->location) {
				bool isNoWarningPair = false;
				
				
				for (const auto& airportRuleParam : _ruleParam->GetAirportParams()) {
					auto range = airportRuleParam._noWarningAirportPairs.equal_range(lastArrive);
					for (auto i = range.first; i != range.second; ++i) {
						if (i->second == roster->location) {
							isNoWarningPair = true; break;
						}
					}
				}
				
				if (isNoWarningPair)
					continue;
				

				if (isNoWarningPair) {
					lastArrive = roster->location;
					lastArrTime = roster->actEndUtc;
					continue;

				}
				_ruleViolation.SetParam("start", to_string(lastArrTime));
				_ruleViolation.SetParam("end", to_string(roster->actEndUtc));
				bool isPa = false;
				if (this->_application == ROSTER_OPTIMIZER && lastRosterIsPA && roster->source == "PA")
					isPa = true;
				if (!isPa) {
					if (this->_application == ROSTER_OPTIMIZER)
						return false;
					ThrowRuleViolationForRoster(roster, 0, lastArrive, roster->location);
					passAllRule = false;
				}
			}
			lastArrive = roster->location;
			lastArrTime = roster->actEndUtc;
		}
		if (roster->source == "PA")
			lastRosterIsPA = true;

        prevRoster = roster;
        rosterIndex++;

	}

	return passAllRule;
}



void CheckImplausibleConnectionsRule::ThrowRuleViolation(const Pairing* pairing , const long long segmentId, const string arr, const string dep) const {

	time_t start = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t end = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);
	std::string msg = "The segment is implausible connections({0:arr} - {1:dep}).";
	msg = StringUtils::Format(msg, arr, dep);

	RULE_VIOLATION* rv = new RULE_VIOLATION();

	rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	rv->pairingId = pairing->getDbId();
	rv->startDTUtc = start;
	rv->endDTUtc = end;
	rv->segmentId = segmentId;
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("arr", arr));
	rv->operation_result.insert(pair<string, string>("dep", dep));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckImplausibleConnectionsRule::ThrowRuleViolationForRoster(const ROSTER* roster, const long long segmentId, const string arr, const string dep) const {
	time_t start = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t end = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);
	std::string msg = "The segment is implausible connections({0:arr} - {1:dep}).";
	msg = StringUtils::Format(msg, arr, dep);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	rv->rosterId = roster->rosterId;
	rv->crewId = ppCrew->idCrew;
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	
	rv->pairingId = roster->pairId;
	rv->startDTUtc = start;
	rv->endDTUtc = end;
	rv->segmentId = segmentId;
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("arr", arr));
	rv->operation_result.insert(pair<string, string>("dep", dep));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckImplausibleConnectionsRule::ParseParam(const InputType& input) {

	//add by hexd 添加DBRule支持
	if (_ruleParam == nullptr) {
		_ruleParam = std::make_unique<CheckImplausibleConnectionsRuleParam>(CheckImplausibleConnectionsRuleParam(this));
	}
	for (const auto& dbRule : input.dbRules) {
		_ruleParam->ParseParam(dbRule);
	}

}
