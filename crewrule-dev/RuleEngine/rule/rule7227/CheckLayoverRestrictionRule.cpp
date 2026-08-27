/**
 * @file CheckLayoverRestrictionRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckLayoverRestrictionRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"

bool CheckLayoverRestrictionRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

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

	bool passAllRule = true;
	bool next = true;

	_ruleViolation.SetRuleParam(_ruleParams[0]);
	_ruleViolation.SetParam("crewId", crew->idCrew);

	for (auto& roster : rosters) {
		if (roster->pairing == nullptr) {
			continue;
		}
		_ruleViolation.SetParam("rosterId", StringUtils::lltos(roster->rosterId));

		bool valid = CheckRule(roster->pairing);
		if (!valid) {
			passAllRule = false;
			if (!this->IsCheckAllRule()) {
				break;
			}
		}
	}

	return passAllRule;
}

bool CheckLayoverRestrictionRule::CheckRule(const Pairing* pairing) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	bool passAllRule = true;
	for (const auto& ruleParam : _ruleParams) {
		if (ruleParam._pairingBase != "*" && ruleParam._pairingBase != pairing->getBase())
			continue;
		_ruleViolation.SetRuleParam(ruleParam);
		_ruleViolation.SetParam("startDate", ruleParam._startDate);
		_ruleViolation.SetParam("endDate", ruleParam._endDate);
		_ruleViolation.SetParam("startStations", ruleParam._depsRaw.empty() ? joinStrList(ruleParam._deps) : ruleParam._depsRaw);
		_ruleViolation.SetParam("endStations", ruleParam._arvsRaw.empty() ? joinStrList(ruleParam._arvs) : ruleParam._arvsRaw);
		_ruleViolation.SetParam("layover", ruleParam._forceLayover == "Y" ? "Y" : "N");
		const auto& duties = pairing->getDutyVec();
		for (size_t i = 0; i < duties.size(); i++) {
			const auto& segments = duties[i]->getSegments();
			for (size_t j = 0; j < segments.size(); j++) {
				if (ruleParam.MatchParam(segments[j])) {
					if (ruleParam._forceLayover == "Y") {
						//只有一个duty直接告警
						if (duties.size() == 1) {
							if (this->_application == PAIRING_OPTIMIZER)
								return false;
							ThrowRuleViolation(segments[j], ruleParam, false, true);
							passAllRule = false;
						}
						const auto& dep = segments[j]->getDepStation();
						const auto& arv = segments[j]->getArrStation();

						// dep的机场需要layover
						if (ruleParam.HasDepConstraint() && ruleParam.MatchDepStation(dep)) {
							//如果不是duty内第一个航班，直接告警
							if (j != 0) {
								if (this->_application == PAIRING_OPTIMIZER)
									return false;
								_ruleViolation.SetParam("layover", "Y");
								ThrowRuleViolation(segments[j], ruleParam, true, true);
								passAllRule = false;
							}
						}
						//arv的机场需要layover
						if (ruleParam.HasArvConstraint() && ruleParam.MatchArvStation(arv)) {
							//如果不是duty内最后一个航班，直接告警
							if (j != segments.size() - 1) {
								if (this->_application == PAIRING_OPTIMIZER)
									return false;
								_ruleViolation.SetParam("layover", "Y");
								ThrowRuleViolation(segments[j], ruleParam, false, true);
								passAllRule = false;
							}
						}

					}
					if (ruleParam._forceNotLayover == "Y") {
						const auto& arv = segments[j]->getArrStation();
						// force-not-layover is controlled by ARVS airports:
						// matched segment cannot be the last segment of any duty.
						if (ruleParam.HasArvConstraint() && ruleParam.MatchArvStation(arv)) {
							if (j == segments.size() - 1) {
								if (this->_application == PAIRING_OPTIMIZER)
									return false;
								_ruleViolation.SetParam("layover", "N");
								ThrowRuleViolation(segments[j], ruleParam, false, false);
								passAllRule = false;
							}
						}
					}
					//if (ruleParam._forceNotLayover == "Y") {
					//	//不是最后一个duty， 如果是duty最后一个航班，告警
					//	if (i != duties.size() - 1 && j != segments.size() - 1) { // use duty level info instead of segment level
					//		if (this->_application == PAIRING_OPTIMIZER)
					//			return false;
					//		ThrowRuleViolation(segments[j]);
					//		passAllRule = false;
					//	}
					//}
					
				}
			}
		}

	}
	return passAllRule;
}

// for po
bool CheckLayoverRestrictionRule::CheckRule(const vector<Segment*> segments) const {
	bool valid = true;
	// 记录pairingBase = *的ruleparam index
	int index = -1;
	for (size_t i = 0; i < _ruleParams.size(); i++) {
		for (const auto& seg : segments) {
			if (_ruleParams[i].MatchParam(seg)) {
				// po, 不是*的匹配上，直接返回true
				if (_ruleParams[i]._pairingBase != "*")
					return true;
				index = (int)i;
			}
		}
	}
	if (index > -1 && index < (int)_ruleParams.size()) {
		const auto& ruleParam = _ruleParams[index];
		for (size_t i = 0; i < segments.size(); i++) {
			if (ruleParam.MatchParam(segments[i])) {
				
				if (ruleParam._forceLayover == "Y") {
					if (i != segments.size() - 1) {
						return false;
					}
				}
				if (ruleParam._forceNotLayover == "Y") {
					if (ruleParam.HasArvConstraint() &&
						ruleParam.MatchArvStation(segments[i]->getArrStation()) &&
						i == segments.size() - 1) {
						return false;
					}
				}
			}
		}
	}

	return valid;
}

void CheckLayoverRestrictionRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckLayoverRestrictionRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CheckLayoverRestrictionRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}


void CheckLayoverRestrictionRule::ThrowRuleViolation(const Segment* segment,
													 const CheckLayoverRestrictionRuleParam& ruleParam,
													 bool useDepStation,
													 bool layoverRequired) const {
	const std::string station = useDepStation ? segment->getDepStation() : segment->getArrStation();
	std::string msg = layoverRequired
		? "Layover at " + station + " is required."
		: "Layover at " + station + " is not allowed.";

	const auto& pattern = useDepStation ? ruleParam._depsPattern : ruleParam._arvsPattern;
	if (!layoverRequired && pattern.isNegated && !pattern.values.empty()) {
		msg += " Allowed layover stations: " + joinStrList(pattern.values, ", ") + ".";
	}
	else if (layoverRequired && !pattern.allowAny && !pattern.values.empty()) {
		msg += " Required layover stations: " + joinStrList(pattern.values, ", ") + ".";
	}

	if ((!ruleParam._startDate.empty() && ruleParam._startDate != "*") ||
		(!ruleParam._endDate.empty() && ruleParam._endDate != "*")) {
		msg += " Applicable period: " + ruleParam._startDate + " - " + ruleParam._endDate + ".";
	}

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr && _ruleViolation.GetRuleLegality()->crewIndex < (int)this->_dbData->crewList.size()) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = StringUtils::stoll(_ruleViolation.GetParam("rosterId"), -1);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	rv->pairingId = segment->getPairingId();
	rv->dutySequenceNumber = segment->getDutySeq();
	rv->startDTUtc = segment->getStartTimeUtcAct();
	rv->endDTUtc = segment->getEndTimeUtcAct();
	rv->segmentId = segment->getDBId();
	rv->violation_msg = msg;
	_ruleViolation.AddRuleViolations(rv);
}
