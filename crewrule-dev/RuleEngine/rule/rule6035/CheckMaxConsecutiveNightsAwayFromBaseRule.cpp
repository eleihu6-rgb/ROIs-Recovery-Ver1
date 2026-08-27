#include "CheckMaxConsecutiveNightsAwayFromBaseRule.h"

#include "RuleParams.h"
#include "CheckMaxConsecutiveNightsAwayFromBaseRuleParam.h"
#include "../utils/TimeUtils.h"
#include "../utils/RuleViolation.h"
#include "Utility.h"
#include "StringUtil.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"



bool CheckMaxConsecutiveNightsAwayFromBaseRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (_ruleParams.empty() || rosters.empty()) {
		return true;
	}
	bool isValid = true;
	int maxTimes;

	if (rosters.size() == 0)
		return true;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	vector<string> bases;
	vector<string> ranks;
	vector<string> fleets;
	for (const auto& _ruleParam : _ruleParams) {
		maxTimes = _ruleParam._maxTimes;
		bases = _ruleParam._bases;
		ranks = _ruleParam._ranks;
		fleets = _ruleParam._fleets;
		_ruleViolation.SetRuleParam(_ruleParam);

		_ruleViolation.SetParam("max_times", std::to_string(maxTimes));
		SharedPtr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];

		vector<string> positionsVec;
		split("*", '|', positionsVec);
		vector<string> teamVec;
		split("*", '|', teamVec);
		string base = crew->getPrimeBase();
		int timezoneOffsetMinutes = 0;
		if (base != "") {
			timezoneOffsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
		}
		for (const auto& rp : this->_dbData->rosterPeriodList) {
			_ruleViolation.SetParam("check_start", std::to_string(rp.rp_start));
			_ruleViolation.SetParam("check_end", std::to_string(rp.rp_end));
			_ruleViolation.SetParam("check_start_utc", std::to_string(rp.rp_start - (time_t)(timezoneOffsetMinutes * 60)));
			_ruleViolation.SetParam("check_end_utc", std::to_string(rp.rp_end - (time_t)(timezoneOffsetMinutes * 60)));
			if (Utility::GetInstancePtr()->isTimeOverlap(rp.rp_start, rp.rp_end, lCheckedStart, lCheckedEnd)) {
				if (!Utility::GetInstancePtr()->isCrewQualified(crew, bases, ranks, fleets, teamVec, positionsVec, rp.rp_start, rp.rp_end))
					continue;
				time_t awayFromBaseStart = 0;
				time_t awayFromBaseEnd = 0;
				bool lastRosterAtBase = true;
				for (auto roster : rosters) {
					if (this->_application == ROSTER_OPTIMIZER && roster->source == "PA") {
						continue;
					}
					if (roster->restStrLoc >= rp.rp_start && roster->strLoc <= rp.rp_end) {
						if (!roster->pairing) {
							if (roster->location == base) {
								if (!lastRosterAtBase) {
									isValid = CheckNightNumber(awayFromBaseStart, awayFromBaseEnd, maxTimes);
								}
								if (!isValid) {
									if (this->_application == ROSTER_OPTIMIZER)
										return isValid;
									ThrowRuleViolation();
								}
								awayFromBaseStart = roster->getEndTimeLocAct();
								lastRosterAtBase = true;
							}
							else {
								lastRosterAtBase = false;
							}
						}
						else {
							const auto& duties = roster->pairing->getDutyVec();
							for (auto duty : duties) {
								if (duty->getDepStation() == base) {
									awayFromBaseEnd = duty->getStartTimeLocAct();
									if (!lastRosterAtBase)
										isValid = CheckNightNumber(awayFromBaseStart, awayFromBaseEnd, maxTimes);
									if (!isValid) {
										if (this->_application == ROSTER_OPTIMIZER)
											return isValid;
										ThrowRuleViolation();
									}
									lastRosterAtBase = true;
									awayFromBaseStart = duty->getStartTimeLocAct();
								}
								else {
									lastRosterAtBase = false;
								}
								if (duty->getArrivalStation() == base) {
									awayFromBaseEnd = duty->getEndTimeLocAct();
									if (!lastRosterAtBase)
										isValid = CheckNightNumber(awayFromBaseStart, awayFromBaseEnd, maxTimes);
									if (!isValid) {
										if (this->_application == ROSTER_OPTIMIZER)
											return isValid;
										ThrowRuleViolation();
									}
									lastRosterAtBase = true;
									awayFromBaseStart = duty->getStartTimeLocAct();
								}
								else {
									lastRosterAtBase = false;
								}
							}
						}
					}
				}
			}
		}
	}


	return isValid;
}

bool CheckMaxConsecutiveNightsAwayFromBaseRule::CheckNightNumber(time_t& start, time_t& end, int maxTimes) const {
	bool isValid = true;
	if (start != 0 && end != 0) {
		int layoverNum = DutyUtils::GetLocalNightNums(start, end);
		if (layoverNum > maxTimes) {
			_ruleViolation.SetParam("nights", std::to_string(layoverNum));
			isValid = false;
		}
		start = 0;
		end = 0;
	}
	return isValid;
}


void CheckMaxConsecutiveNightsAwayFromBaseRule::ThrowRuleViolation() const {
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	//rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
	string msg = "The number of nights away from home base ({0:nights}) is more than the maximum allowed ({1:max_times}) in the period ({2:check_start}-{3:check_end}).";
	msg = StringUtils::Format(msg, 
		_ruleViolation.GetParam("nights"),
		_ruleViolation.GetParam("max_times"), 
		TimeUtils::Format(StringUtils::stoi(_ruleViolation.GetParam("check_start"), 0), "yyyy-mm-dd"),
		TimeUtils::Format(StringUtils::stoi(_ruleViolation.GetParam("check_end"), 0), "yyyy-mm-dd"));

	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	rv->startDTUtc = stol(_ruleViolation.GetParam("check_start_utc"));
	rv->endDTUtc = stol(_ruleViolation.GetParam("check_end_utc"));
	rv->crewId = ppCrew->idCrew;
	rv->violation_msg = msg;
	rv->description = _ruleParams[0].GetDescription();
	rv->idRule = _ruleParams[0].GetId();
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	//OP#1448提供message参数给gantt
	rv->operation_result.insert(pair<string, string>("iNight", _ruleViolation.GetParam("nights")));
	rv->operation_result.insert(pair<string, string>("strMaxTimes", _ruleViolation.GetParam("max_times")));
	//rv->operation_result.insert(pair<string, string>("strStart", strStart));
	//rv->operation_result.insert(pair<string, string>("strEnd", strEnd));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckMaxConsecutiveNightsAwayFromBaseRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckMaxConsecutiveNightsAwayFromBaseRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
		return;
	}
}