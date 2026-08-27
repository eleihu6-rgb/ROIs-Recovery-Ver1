/**
 * @file RestictCrewOrFlightForPRRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-09-04
**/

#include "../RuleSytem.h"
#include "RestictCrewOrFlightForPRRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "index/CrewRpRecencyIndex.h"


bool RestictCrewOrFlightForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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

	for (const auto & ruleParam : _ruleParams) {
		//if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
		//	continue;
		//}
		if (!ruleParam.MatchCrewNationalities(crew)) {
			continue;
		}

		_ruleViolation.SetRuleParam(ruleParam);

		bool valid = CheckRule(rosters, crew, offsetTZMinutes, ruleParam);
		if (!valid) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}


bool RestictCrewOrFlightForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const RestictCrewOrFlightForPRRuleParam& ruleParam) const {
	bool passAllRule = true;
	for (auto& roster : rosters) {
		if (roster->pairing == nullptr) {
			continue;
		}
		bool valid = CheckRule(roster, crew, offsetTZMinutes, ruleParam);
		if (!valid) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}

bool RestictCrewOrFlightForPRRule::CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const RestictCrewOrFlightForPRRuleParam& ruleParam) const {
	bool valid = true;
	bool matchCrew = ruleParam.MatchCrew(roster, crew);

	if (ruleParam._restictCrewOrFlight == "C") {
		//满足条件的航班只能由这些Crew执行
		for (auto& segment : roster->pairing->getSegmentsRead()) {
			if (ruleParam.MatchFlight(roster, segment)) {
				if (!matchCrew) {
					ThrowRuleViolationForFlight(roster, crew, segment, ruleParam);
					valid = false;
				}
			}
		}
	}
	else if(ruleParam._restictCrewOrFlight == "F") {
		//满足条件Crew，不能执行下面航班任务
		if (matchCrew) {
			for (auto& segment : roster->pairing->getSegmentsRead()) {
				if (ruleParam.MatchFlight(roster, segment)) {
					ThrowRuleViolationForCrew(roster, crew, segment, ruleParam);
					valid = false;
				}
			}
		}
	}
	else {
		Logger::getRuleLogger()->error("[RestictCrewOrFlightForPRRule::CheckRule] config error. restictCrewOrFlight={}", ruleParam._restictCrewOrFlight);
	}
	return valid;
}


void RestictCrewOrFlightForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(RestictCrewOrFlightForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(RestictCrewOrFlightForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void RestictCrewOrFlightForPRRule::ThrowRuleViolationForFlight(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const Segment* segment, const RestictCrewOrFlightForPRRuleParam& ruleParam) const {
	//航班只能由这些Crew执行
	string msg = "The flight ({0:airline}{1:flightNum}) can only be operated by the crew.";
	msg = StringUtils::Format(msg, segment->getAirline(), segment->getFlightNumber());
	
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

void RestictCrewOrFlightForPRRule::ThrowRuleViolationForCrew(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const Segment* segment, const RestictCrewOrFlightForPRRuleParam& ruleParam) const {
	//Crew不能执行这些航班任务
	string msg = "The crew cannot operate the flight ({0:airline}{1:flightNum}).";
	msg = StringUtils::Format(msg, segment->getAirline(), segment->getFlightNumber());

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