/**
 * @file LimitRestTimeBetweenFlightsForSQRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-01-07
**/

#include "../RuleSytem.h"
#include "LimitRestTimeBetweenFlightsForSQRule.h"
#include "../utils/StringUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/TimeUtils.h"

bool LimitRestTimeBetweenFlightsForSQRule::CheckRule(const Pairing* pairing) const {
	return CheckRule(pairing->getDutyVec());
}

bool LimitRestTimeBetweenFlightsForSQRule::CheckRule(const Duty* duty) const {
	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	return CheckRule(duties);
}

bool LimitRestTimeBetweenFlightsForSQRule::CheckRule(const vector<Duty*>& duties) const {
	if (_ruleParams.empty()) {
		return true;
	}
	vector<Segment*> allSegments;
	for (auto duty : duties) {
		for (auto& segment : duty->getSegmentsRead()) {
			allSegments.emplace_back(segment);
		}
	}

	bool passAllRule = true;
	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);

		if (!ruleParam._active) {
			continue;
		}
		for (size_t i = 0; i < allSegments.size(); i++) {
			auto currSegment = allSegments[i];
			auto prevSegment = (i == 0) ? nullptr : allSegments[i - 1];
			auto nextSegment = (i == allSegments.size() - 1) ? nullptr : allSegments[i + 1];

			if (!ruleParam.MatchParam(currSegment, nextSegment)) {
				continue;
			}
			bool valid = CheckRule(prevSegment, currSegment, nextSegment, ruleParam);
			if (!valid) {
				passAllRule = false;
				if (!this->IsCheckAllRule()) {
					return passAllRule;
                }
			}
		}

	}
	return passAllRule;
}

bool LimitRestTimeBetweenFlightsForSQRule::CheckRule(const Segment* prevSegment, const Segment* currSegment, const Segment* nextSegment, const LimitRestTimeBetweenFlightsForSQRuleParam& ruleParam) const {
	bool valid = true;

	time_t restStartTimeUtc = 0;
	time_t restEndTimeUtc = 0;

	if (ruleParam._type == "BEFORE") {
		if (prevSegment == nullptr) {
			return true;
		}
		Segment* seg1 = const_cast<Segment*>(prevSegment);
		Segment* seg2 = const_cast<Segment*>(currSegment);
		long_transit* longTransit = nullptr;
		if (seg1->getDutyId() == seg2->getDutyId()) {
			longTransit = RuleParams::GetInstancePtr()->getLongTransit(seg1, seg2);
		}
		SegmentUtils::GetActualRestStartAndEndTimeUtc(restStartTimeUtc, restEndTimeUtc, prevSegment, currSegment, longTransit);
	}
	else if (ruleParam._type == "AFTER" || ruleParam._type == "CONN") {
		if (nextSegment == nullptr) {
			return true;
		}
		Segment* seg1 = const_cast<Segment*>(currSegment);
		Segment* seg2 = const_cast<Segment*>(nextSegment);
		long_transit* longTransit = nullptr;
		if (seg1->getDutyId() == seg2->getDutyId()) {
			longTransit = RuleParams::GetInstancePtr()->getLongTransit(seg1, seg2);
		}
		SegmentUtils::GetActualRestStartAndEndTimeUtc(restStartTimeUtc, restEndTimeUtc, currSegment, nextSegment, longTransit);
	}
	if (restStartTimeUtc == 0 || restEndTimeUtc == 0) {
		return true;
	}
	int actRestMinutes = static_cast<int>(restEndTimeUtc - restStartTimeUtc) / 60;
	if (actRestMinutes < ruleParam._minTimeLimitMinutes || actRestMinutes > ruleParam._maxTimeLimitMinutes) {
		valid = false;
		ThrowRuleViolation(restStartTimeUtc, restEndTimeUtc, actRestMinutes, prevSegment, currSegment, nextSegment, ruleParam);
	}

	return valid;
}

void LimitRestTimeBetweenFlightsForSQRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitRestTimeBetweenFlightsForSQRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitRestTimeBetweenFlightsForSQRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitRestTimeBetweenFlightsForSQRule::ThrowRuleViolation(const time_t restStartTimeUtc, const time_t restEndTimeUtc, const int actRestMinutes, const Segment* prevSegment, const Segment* currSegment, const Segment* nextSegment, const LimitRestTimeBetweenFlightsForSQRuleParam& ruleParam) const {
	string actRestHHmm = TimeUtils::MinutesTohhmm(actRestMinutes);
	std::string msg = "";
	if (ruleParam._type == "BEFORE") {
		//航班{0:flightNum}前休息不满足需求
		msg = "The actual rest period ({0:actRestHHmm}) before flight ({1:flightNum}) doesn't meet the requirement ({2:minLimit}-{3:maxLimit}).";
		msg = StringUtils::Format(msg, actRestHHmm, currSegment->getFlightNumber() + " " + currSegment->getDepStationRead() + "-" + currSegment->getArrStationRead(), ruleParam._minTimeLimit, ruleParam._maxTimeLimit);
	}
	else if (ruleParam._type == "AFTER") {
		//航班{0:flightNum}后休息不满足需求
		msg = "The actual rest period ({0:actRestHHmm}) after flight ({1:flightNum}) doesn't meet the requirement ({2:minLimit}-{3:maxLimit}).";
		msg = StringUtils::Format(msg, actRestHHmm, currSegment->getFlightNumber() + " " + currSegment->getDepStationRead() + "-" + currSegment->getArrStationRead(), ruleParam._minTimeLimit, ruleParam._maxTimeLimit);
	}
	else if (ruleParam._type == "CONN") {
		//二个航班{0:flightNum}之间休息不满足需求
		msg = "The actual rest period ({0:actRestHHmm}) between flights ({1:flightNum}/{2:flightNum}) don't meet the requirement ({3:minLimit}-{4:maxLimit}).";
		msg = StringUtils::Format(msg, actRestHHmm, currSegment->getFlightNumber() + " " + currSegment->getDepStationRead() + "-" + currSegment->getArrStationRead(), nextSegment->getFlightNumber() + " " + nextSegment->getDepStationRead() + "-" + nextSegment->getArrStationRead(), ruleParam._minTimeLimit, ruleParam._maxTimeLimit);
	}

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = LimitRestTimeBetweenFlightsForSQRule::RuleFuncId;
	rv->pairingId = currSegment->getPairingId();
	rv->dutySequenceNumber = currSegment->getDutySeq();
	rv->segmentId = currSegment->getDBId();
	rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		if (this->_dbData != nullptr) {
			const int crewIndex = _ruleViolation.GetRuleLegality()->crewIndex;
			if (crewIndex >= 0 && crewIndex < static_cast<int>(this->_dbData->crewList.size())) {
				SharedPtr<CREW> ppCrew = this->_dbData->crewList[crewIndex];
				if (ppCrew != nullptr) {
					const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, currSegment->getPairingId());
					rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
					rv->crewId = ppCrew->idCrew;
					_ruleViolation.SetLegalityMessage(ppCrew, msg);
				}
			}
		}
	}
	else {
		_ruleViolation.SetLegalityMessage(const_cast<Segment*>(currSegment), msg);
	}
	rv->startDTUtc = restStartTimeUtc;
	rv->endDTUtc = restEndTimeUtc;
	rv->violation_msg = msg;

	_ruleViolation.AddRuleViolations(rv);
}
