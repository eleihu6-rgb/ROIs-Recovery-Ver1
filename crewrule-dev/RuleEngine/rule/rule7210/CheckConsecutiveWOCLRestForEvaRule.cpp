#include "CheckConsecutiveWOCLRestForEvaRule.h"

#include "RuleParams.h"
#include "CheckConsecutiveWOCLRestForEvaRuleParam.h"
#include "utils/TimeUtils.h"
#include "utils/DutyUtils.h"
#include "utils/RosterUtils.h"
#include "TimezoneUtils.h"



bool CheckConsecutiveWOCLRestForEvaRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (_ruleParams.empty() || rosters.empty()) {
		return true;
	}
	bool isValid = true;
	time_t dutyStart = 0;
	bool isCovered = false;
	bool isConsecutive = true;
	vector<Duty*> duties;
	int startLoc, endLoc;
	int needLocalNightNum = 0;

	vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
	string airlinecode = this->_dbData->scenario.airline;
	vector<string> restAssignments;
	//for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); ++assignment)
	//{

	//	if ((*assignment)->assignmentGroup == "REST" && (this->_dbData->version == 3 || (*assignment)->airline == airlinecode))
	//		restAssignments.push_back((*assignment)->assignemnt);
	//}
	//for (const auto & roster : rosters)
	//{
	//	if (find(restAssignments.begin(), restAssignments.end(), roster->qualifier) != restAssignments.end())
	//		continue;
	//	if (roster->pairing) {
	//		vector<Duty*> oldVector = roster->getOperatingDuties();
	//		for (const auto& duty : oldVector)
	//			duties.push_back(duty);
	//	}
	//	else {
	//		
	//	}
	//}

	auto tmpWorkPeriods = WorkPeriod::GetWorkFDPPeriods(rosters, this->_dbData);
	vector<std::shared_ptr<WorkPeriod>> tmpWorkPeriods2;
	for (auto& tmpWorkPeriod : tmpWorkPeriods) {
		tmpWorkPeriods2.emplace_back(std::move(tmpWorkPeriod));
	}

	for (const auto & ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);
		startLoc = ruleParam._woclStart;
		endLoc = ruleParam._woclEnd;
		if (ruleParam._minRests.size() == 0)
			continue;

		vector<std::shared_ptr<WorkPeriod>> workPeriods;
		for (auto& tmpWorkPeriod : tmpWorkPeriods2) {
			if (tmpWorkPeriod->GetWorkType() == WorkType::FltDuty
				&& RosterUtils::ExistExceptionCode(tmpWorkPeriod->GetRoster(), (Duty*)tmpWorkPeriod->GetWork(), ruleParam.GetExceptionCodes(), _dbData)) {
				//设置Exception Code，忽略该WorkPeriod
				continue;
			}
			workPeriods.emplace_back(tmpWorkPeriod);
		}

		vector<std::shared_ptr<WorkPeriod>> earlyDuties;
		//std::copy(oldVector.begin(), oldVector.end(), std::back_inserter(duties));
		for (size_t i = 0; i < workPeriods.size(); i++)
		{
			if (workPeriods[i]->GetWorkType() == GroundRoster) {
				if (earlyDuties.size() < 2 || ruleParam._minRests.size() < earlyDuties.size()) {
					earlyDuties.clear();
					continue;
				}
				
				isValid = CheckRest(earlyDuties[earlyDuties.size() - 1], workPeriods[i], ruleParam._minRests[earlyDuties.size() - 1], ruleParam);
				if (!isValid) {
					if (this->_application == ROSTER_OPTIMIZER) {
						// RO忽略预占告警，如果有不是PA的，返回false，全是PA，不返回false
						if (workPeriods[i]->GetSource() != "PA")
							return false;
						for (const auto duty : earlyDuties) {
							if (duty->GetSource() != "PA")
								return false;
						}
					}
					_ruleViolation.SetParam("number", to_string(earlyDuties.size()));
					ThrowRuleViolation();
					
				}
				continue;
			}
			//auto depOffsetMinutes = DutyUtils::GetTimeZoneOffsetByDep(*duties[i], this->_dbData);
			//auto arvOffsetMinutes = DutyUtils::GetTimeZoneOffsetByArr(*duties[i], this->_dbData);
			isConsecutive = true;
			const auto& fdpStartUtc = workPeriods[i]->GetFDPStartTimeUTC();
			const auto& fdpEndUtc = workPeriods[i]->GetFDPEndTimeUTC();

			const auto& zoneId = this->_dbData->airportCodeMap[workPeriods[i]->GetStartStation()]->zoneId;
			
			const auto& offset = TimezoneUtils::GetTimezoneOffset(fdpStartUtc, zoneId);

			//isCovered = Utility::GetInstancePtr()->isTimeCoveredInRange(startUtc, offsetMinutes, startLoc , endLoc);
			//isCovered = TimeUtils::IsTimesInRange(dutyStart + offsetMinutes * 60, startLoc, endLoc);
			if (fdpStartUtc <= 0 || fdpEndUtc <= 0) {
				isCovered = false;
			}
			else {
				isCovered = TimeUtils::IsTimesCovered(fdpStartUtc + offset * 60, fdpEndUtc + offset * 60, startLoc, endLoc);
			}

			if (earlyDuties.size() > 0) {
				// 间距检查
				time_t next_start = workPeriods[i]->GetStartTimeUTC();
				time_t before_end = earlyDuties.at(earlyDuties.size() - 1)->GetEndTimeUTC();
				if (earlyDuties.size() - 1 < ruleParam._minRests.size()) {
					if (next_start - before_end >= ruleParam._minRests[earlyDuties.size() - 1] * 3600) {
						isConsecutive = false;
					}
				}
				
			}

			if (isCovered && isConsecutive)
			{
				earlyDuties.push_back(workPeriods[i]);
			} else {
				if (earlyDuties.size() < 2 || ruleParam._minRests.size() < earlyDuties.size()) {
					earlyDuties.clear();
					if (isCovered)
						earlyDuties.push_back(workPeriods[i]);
					continue;
				}
				isValid = CheckRest(earlyDuties[earlyDuties.size() - 1], workPeriods[i], ruleParam._minRests[earlyDuties.size() - 1], ruleParam);
				if (!isValid) {
					if (this->_application == ROSTER_OPTIMIZER) {
						// RO忽略预占告警，如果有不是PA的，返回false，全是PA，不返回false
						if (workPeriods[i]->GetSource() != "PA")
							return false;
						for (const auto duty : earlyDuties) {
							if (duty->GetSource() != "PA")
								return false;
						}
					}
					_ruleViolation.SetParam("number", to_string(earlyDuties.size()));
					ThrowRuleViolation();
				}

				earlyDuties.clear();
				if (isCovered)
					earlyDuties.push_back(workPeriods[i]);
				
			}
			if ((int)earlyDuties.size() > ruleParam._maxConsecutiveWoclNumber) {
				if (this->_application == ROSTER_OPTIMIZER) {
					return false;
				}
				_ruleViolation.SetParam("number", to_string(earlyDuties.size()));
				_ruleViolation.SetParam("start", to_string(earlyDuties[0]->GetStartTimeUTC()));
				_ruleViolation.SetParam("end", to_string(earlyDuties[earlyDuties.size() - 1]->GetEndTimeUTC()));
				_ruleViolation.SetParam("max_limit", to_string(ruleParam._maxConsecutiveWoclNumber));
				ThrowRuleViolationForDutyNumber();
				earlyDuties.clear();
			}
			

		}
	}

	return isValid;
}

bool CheckConsecutiveWOCLRestForEvaRule::CheckRest(const std::shared_ptr<WorkPeriod>& beforeDuty, const std::shared_ptr<WorkPeriod>& afterDuty, const int minRest, const CheckConsecutiveWOCLRestForEvaRuleParam& ruleParam) const {
	bool isValid = true;
	time_t next_start = afterDuty->GetStartTimeUTC();	
	time_t before_end = beforeDuty->GetEndTimeUTC();

	/*if (beforeDuty->GetWorkType() == FltDuty && beforeDuty->GetRoster()) {
		for (const auto& duty : beforeDuty->GetRoster()->pairing->getDutyVec()) {
			if (to_string(duty->getDutyId()) == beforeDuty->GetKey()) {
				before_end = duty->getEndTimeUtcAct();
			}
		}
	}

	if (afterDuty->GetWorkType() == FltDuty && afterDuty->GetRoster()) {
		for (const auto& duty : afterDuty->GetRoster()->pairing->getDutyVec()) {
			if (to_string(duty->getDutyId()) == afterDuty->GetKey()) {
				next_start = duty->getStartTimeUtcAct();
			}
		}
	}*/

	if (next_start - before_end < (time_t)minRest * 3600) {
		
		_ruleViolation.SetParam("start", to_string(beforeDuty->GetStartTimeUTC()));
		_ruleViolation.SetParam("end", to_string(afterDuty->GetEndTimeUTC()));
		
		_ruleViolation.SetParam("act_rest", TimeUtils::MinutesTohhmm(static_cast<int>(next_start - before_end) / 60));
		_ruleViolation.SetParam("min_rest", TimeUtils::MinutesTohhmm(minRest * 60));
		isValid = false;
	}
	return isValid;
}


void CheckConsecutiveWOCLRestForEvaRule::ThrowRuleViolation() const {
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	//rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
	string msg = "For the concecutive WOCL duties(" + _ruleViolation.GetParam("number") + "), the actual rest " + _ruleViolation.GetParam("act_rest");
	msg += " is less than " + _ruleViolation.GetParam("min_rest");
	
	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	//_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	rv->startDTUtc = stol(_ruleViolation.GetParam("start"));
	rv->endDTUtc = stol(_ruleViolation.GetParam("end"));
	rv->crewId = ppCrew->idCrew;
	rv->violation_msg = msg;
	rv->description = _ruleParams[0].GetDescription();
	rv->idRule = _ruleParams[0].GetId();
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	//OP#1448提供message参数给gantt
	rv->operation_result.insert(pair<string, string>("iConsecutiveWOCLDutyies", _ruleViolation.GetParam("consecutive_wocl_duties")));
	rv->operation_result.insert(pair<string, string>("strMaxTimes", _ruleViolation.GetParam("max_times")));
	//rv->operation_result.insert(pair<string, string>("strStart", strStart));
	//rv->operation_result.insert(pair<string, string>("strEnd", strEnd));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckConsecutiveWOCLRestForEvaRule::ThrowRuleViolationForDutyNumber() const {
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	//rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
	string msg = "Concecutive WOCL duties(" + _ruleViolation.GetParam("number") + ") is more than the limitation(" + _ruleViolation.GetParam("max_limit") + ").";

	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	//_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	rv->startDTUtc = stol(_ruleViolation.GetParam("start"));
	rv->endDTUtc = stol(_ruleViolation.GetParam("end"));
	rv->crewId = ppCrew->idCrew;
	rv->violation_msg = msg;
	rv->description = _ruleParams[0].GetDescription();
	rv->idRule = _ruleParams[0].GetId();
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	//OP#1448提供message参数给gantt
	rv->operation_result.insert(pair<string, string>("iConsecutiveWOCLDutyies", _ruleViolation.GetParam("consecutive_wocl_duties")));
	rv->operation_result.insert(pair<string, string>("strMaxTimes", _ruleViolation.GetParam("max_limit")));
	//rv->operation_result.insert(pair<string, string>("strStart", strStart));
	//rv->operation_result.insert(pair<string, string>("strEnd", strEnd));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckConsecutiveWOCLRestForEvaRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckConsecutiveWOCLRestForEvaRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}