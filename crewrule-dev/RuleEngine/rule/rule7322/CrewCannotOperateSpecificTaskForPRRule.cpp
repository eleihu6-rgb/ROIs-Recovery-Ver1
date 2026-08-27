/**
 * @file CrewCannotOperateSpecificTaskForPRRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-10-15
**/

#include "../RuleSytem.h"
#include "CrewCannotOperateSpecificTaskForPRRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/PhaseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "index/CrewRpRecencyIndex.h"


bool CrewCannotOperateSpecificTaskForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;
	if (rosters.empty()) {
		return true;
	}
	time_t checkedStartTime = 0, checkedEndTime = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		checkedStartTime = this->_dbData->scenario.startDtUTC;
		checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		checkedStartTime = rosters[0]->actStrUtc;
		checkedEndTime = rosters[rosters.size() - 1]->restStrUtc;
	}

	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string crewBase = crew->getPrimeBase();
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeLocSch(), crewBase, this->GetDataContext());

	for (const auto& ruleParam : _ruleParams) {
		//if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
		//	continue;
		//}
		if (!ruleParam.MatchCrewNationalities(crew)) {
			continue;
		}

		_ruleViolation.SetRuleParam(ruleParam);

		bool valid = CheckRule(rosters, crew, ruleParam);
		if (!valid) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}


bool CrewCannotOperateSpecificTaskForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const CrewCannotOperateSpecificTaskForPRRuleParam& ruleParam) const {
	bool passAllRule = true;
	for (auto& roster : rosters) {
		if (!ruleParam.MatchCrew(roster, crew)) {
			continue;
		}
		bool valid = CheckRule(roster, crew, ruleParam);
		if (!valid) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}

bool CrewCannotOperateSpecificTaskForPRRule::CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const CrewCannotOperateSpecificTaskForPRRuleParam& ruleParam) const {
	bool valid = true;

	if (roster->pairing == nullptr) {

		if (roster != nullptr && !PhaseUtils::IsChecked(roster, ruleParam.GetPhase(), this->_dbData)) {
			return true;
		}

		if (CanOperate(roster, ruleParam)) {
			valid = false;
			ThrowRuleViolationForGroundRoster(roster, crew, ruleParam);
		}
	}
	else{
		for (auto& segment : roster->pairing->getSegmentsRead()) {

			if (segment != nullptr && !PhaseUtils::IsChecked(segment, ruleParam.GetPhase(), this->_dbData)) {
				return true;
			}

			if (CanOperate(roster, segment, ruleParam)) {
				valid = false;
				ThrowRuleViolationForFlight(roster, crew, segment, ruleParam);
			}
		}
	}


	return valid;
}

bool CrewCannotOperateSpecificTaskForPRRule::CanOperate(const ROSTER* roster, const CrewCannotOperateSpecificTaskForPRRuleParam& ruleParam) const {
	if (ruleParam.MatchGroundRoster(roster)) {
		return true;
	}
	return false;
}

bool CrewCannotOperateSpecificTaskForPRRule::CanOperate(const ROSTER* roster, const Segment* segment, const CrewCannotOperateSpecificTaskForPRRuleParam& ruleParam) const {
	if (ruleParam.MatchFlight(roster, segment)) {
		return true;
	}
	return false;
}

void CrewCannotOperateSpecificTaskForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CrewCannotOperateSpecificTaskForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CrewCannotOperateSpecificTaskForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void CrewCannotOperateSpecificTaskForPRRule::ThrowRuleViolationForFlight(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const Segment* segment, const CrewCannotOperateSpecificTaskForPRRuleParam& ruleParam) const {
	//Crew非法执行这些航班任务
	string msg = "Filtered crew (Para: {0:crewFilterConditon}) cannot operate flights (Para: {1:taskFilterConditon}).";
	msg = StringUtils::Format(msg, ruleParam.GetCrewFilterConditionDesc(), ruleParam.GetTaskFilterConditionDesc());

	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->rosterId = roster->rosterId;
	rv->pairingId = roster->pairing == nullptr ? -1 : roster->pairId;
	rv->dutySequenceNumber = segment->getDutySeq();
	rv->segmentId = segment->getDBId();
	rv->startDTUtc = segment->getStartTimeUtcAct();
	rv->endDTUtc = segment->getEndTimeUtcAct();
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("airline", segment->getAirline()));
	rv->operation_result.insert(pair<string, string>("flightNum", segment->getFlightNumber()));

	_ruleViolation.AddRuleViolations(rv);
}

void CrewCannotOperateSpecificTaskForPRRule::ThrowRuleViolationForGroundRoster(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const CrewCannotOperateSpecificTaskForPRRuleParam& ruleParam) const {
	//Crew非法执行这些地面任务
	string msg = "Filtered crew (Para: {0:crewFilterConditon}) cannot operate ground duties (Para: {1:taskFilterConditon}).";
	msg = StringUtils::Format(msg, ruleParam.GetCrewFilterConditionDesc(), ruleParam.GetTaskFilterConditionDesc());

	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->rosterId = roster->rosterId;
	rv->startDTUtc = roster->getStartTimeUtcAct();
	rv->endDTUtc = roster->getRestStartUtcAct();
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("assignment", roster->qualifier));
	_ruleViolation.AddRuleViolations(rv);
}