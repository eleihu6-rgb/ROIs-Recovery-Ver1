/**
 * @file LimitTransitAndLayoverRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitTransitAndLayoverRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

bool LimitTransitAndLayoverRule::CheckRule(const Pairing* pairing) const {
	if (this->_ruleParam->Empty()) {
		return true;
	}
	return CheckRule(pairing->getDutyVec());
}

bool LimitTransitAndLayoverRule::CheckRule(const Duty* duty) const {
	if (this->_ruleParam->Empty()) {
		return true;
	}
	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	return CheckRule(duties);
}

bool LimitTransitAndLayoverRule::CheckRule(const vector<Duty*>& duties) const {
	if (duties.empty()) {
		return true;
	}

    std::string base; // left blank will use the context find pairing id from duty or segment
    if (this->IsPairingOptimizerModel()) {
        base = duties.front()->getDepStationRead(); // PO can't get pairing from either duty or segments
    }

	bool passAllRule = true;
	bool next = true;
	for (std::size_t i = 0; i < duties.size(); ++i) {
		if (!passAllRule && !this->IsCheckAllRule()) break;
		auto& duty = duties[i];

		//判断X基地航班在X机场中转能否过夜
		if (i < duties.size() - 1) {
			for (const auto & ruleParam : _ruleParam->GetLimitLayoverParams()) {
				_ruleViolation.SetRuleParam(ruleParam);
				_ruleViolation.SetParam("homeBase", ruleParam._strPairingBases);
				bool valid = CheckRule(duty, base, ruleParam);
				if (!valid) {
					passAllRule = false;
					break;
				}
			}
		}

		//判断X基地航班在X机场中转能否换飞机，以及是否满足中转时长
		for (const auto & ruleParam : _ruleParam->GetLimitAircraftChangeAndConnectionParams()) {
			_ruleViolation.SetRuleParam(ruleParam);
			_ruleViolation.SetParam("minConnection", ruleParam._minConnection);
			_ruleViolation.SetParam("maxConnection", ruleParam._maxConnection);
			_ruleViolation.SetParam("isAcChg", ruleParam._strIsAcChg);
			_ruleViolation.SetParam("transitAirports", ruleParam._strTransitAirports);
			_ruleViolation.SetParam("checkGroups", ruleParam._strCheckGroups);
			_ruleViolation.SetParam("homeBase", ruleParam._strPairingBases);
			bool valid = CheckRule(next, duty, base, ruleParam);
			if (!valid) {
				passAllRule = false;
			}
			if (!next) {
				break;
			}
		}
	}
	return passAllRule;
}

bool LimitTransitAndLayoverRule::CheckRule(const Duty* duty,
                                           const std::string& base,
                                           const LimitLayoverParam& ruleParam) const {
	if (ruleParam.MatchParam(*duty, base) && !ruleParam.CheckParam(*duty)) {
		ThrowLayoverRuleViolation(duty);
		return false;
	}
	return true;
}

bool LimitTransitAndLayoverRule::CheckRule(bool& next, const Duty* duty,
                                           const std::string& base,
                                           const LimitAircraftChangeAndConnectionParam& ruleParam) const {
	bool valid = true;
	bool filterPass = false;
	next = true;
	for (int i = 0; i < (int)duty->getNumSegments() - 1; i++) {
		Segment* segment = duty->getSegment(i);
		Segment* nextSegment = duty->getSegment(i + 1);
		if (ruleParam.MatchParam(*segment, *nextSegment, base)) {
			filterPass = true;
			LimitAircraftChangeAndConnectionParam::WarnCode warnCode = ruleParam.CheckParam(*segment, *nextSegment);
			if (warnCode != LimitAircraftChangeAndConnectionParam::WarnCode::NO_WARN) {
				valid = false;

				//检查同组规则，是否合法；若同组法规合法，则认为合法。
				auto sameGroupRuleParams = _ruleParam->GetLimitAircraftChangeAndConnectionParams(ruleParam._checkGroups);
				for (const auto & sameGroupRuleParam : sameGroupRuleParams) {
					if (sameGroupRuleParam == ruleParam) {
						//比较当前法规与同组法规是否同一法规，若是同一法规则不在检查
						continue;
					}
					if (sameGroupRuleParam.MatchParam(*segment, *nextSegment, base)) {
						LimitAircraftChangeAndConnectionParam::WarnCode warnCode = ruleParam.CheckParam(*segment, *nextSegment);
						if (warnCode == LimitAircraftChangeAndConnectionParam::WarnCode::NO_WARN) {
							//同组规则合规，则退出
							valid = true;
							break;
						}
					}
				}

				if (!valid) {
					ThrowTransitRuleViolation(duty, segment, warnCode);
				}
			}
		}
	}
    if (filterPass) next = false; // matching first parameter, no need to check for next entry of rule
	return valid;
}

void LimitTransitAndLayoverRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	if (_ruleParam == nullptr) {
		_ruleParam = std::make_unique<TransitAndLayoverRuleParam>(TransitAndLayoverRuleParam(this));
	}
	for (const auto& dbRule : input.dbRules) {
		_ruleParam->ParseParam(dbRule);
	}
	if (!_ruleParam->Empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParam->ParseParam(singleRuleParamString);
	}
}

void LimitTransitAndLayoverRule::ThrowLayoverRuleViolation(const Duty* duty) const {
	string homeBase = _ruleViolation.GetParam("homeBase");
	std::string msg = "Layover at station ({0:station}) is not allowed from home base ({1:homeBase}).";
	msg = StringUtils::Format(msg, duty->getArrStation(), homeBase);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = LimitTransitAndLayoverRule::RuleFuncId;
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySegNum();
	rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, duty->getPairingId());
		rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
	}
	else {
		_ruleViolation.SetLegalityMessage(const_cast<Duty*>(duty), msg, LimitTransitAndLayoverRule::RuleFuncId);
	}
	rv->startDTUtc = duty->getStartTimeUtcAct();
	rv->endDTUtc = duty->getEndTimeUtcAct();
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("ruleId", StringUtils::lltos(rv->idRule)));
	rv->operation_result.insert(pair<string, string>("station", duty->getArrStation()));
	rv->operation_result.insert(pair<string, string>("homeBase", homeBase));
	_ruleViolation.AddRuleViolations(rv);
}

void LimitTransitAndLayoverRule::ThrowTransitRuleViolation(const Duty* duty, const Segment* segment
	, const LimitAircraftChangeAndConnectionParam::WarnCode warnCode) const {
	string homeBase = _ruleViolation.GetParam("homeBase");
	string minConnection = _ruleViolation.GetParam("minConnection");
	string maxConnection = _ruleViolation.GetParam("maxConnection");
	string isAcChg = _ruleViolation.GetParam("isAcChg");
	string transitAirports = _ruleViolation.GetParam("transitAirports");
	string transitDuration = _ruleViolation.GetParam("transitDuration");

	std::string msg = "Transit at station ({0:station}) is not allowed from home base ({1:homeBase}), transit duration {2:transitDuration} exceeds the connection limit [{3:minConnection}, {4:maxConnection}).";
	msg = StringUtils::Format(msg, segment->getArrStation(), homeBase, transitDuration, minConnection, maxConnection);

	if (warnCode == LimitAircraftChangeAndConnectionParam::WarnCode::AC_CHG_WARN) {
		msg = "Aircraft change at station ({0:station}) is not allowed from home base ({1:homeBase}).";
		msg = StringUtils::Format(msg, segment->getArrStation(), homeBase);
	}

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = LimitTransitAndLayoverRule::RuleFuncId;
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySegNum();
	rv->segmentId = segment->getSegmentId();
	rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, duty->getPairingId());
		rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
	}
	else {
		_ruleViolation.SetLegalityMessage(const_cast<Duty*>(duty), msg, LimitTransitAndLayoverRule::RuleFuncId);
	}
	rv->startDTUtc = duty->getStartTimeUtcAct();
	rv->endDTUtc = duty->getEndTimeUtcAct();
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("ruleId", StringUtils::lltos(rv->idRule)));
	rv->operation_result.insert(pair<string, string>("station", segment->getArrStation()));
	rv->operation_result.insert(pair<string, string>("transitDuration", transitDuration));
	rv->operation_result.insert(pair<string, string>("minConnection", minConnection));
	rv->operation_result.insert(pair<string, string>("maxConnection", maxConnection));
	rv->operation_result.insert(pair<string, string>("homeBase", homeBase));
	_ruleViolation.AddRuleViolations(rv);
}