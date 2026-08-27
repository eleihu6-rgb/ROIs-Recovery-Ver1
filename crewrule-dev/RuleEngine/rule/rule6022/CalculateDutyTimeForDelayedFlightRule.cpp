/**
 * @file MaxFlightDutyBySplitDutyRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "CalculateDutyTimeForDelayedFlightRule.h"
#include <cfloat>
#include <algorithm>
#include "../RuleSytem.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/DutyUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

void CalculateDutyTimeForDelayedFlightRule::CalculateDuty(Duty *duty) {
	if (this->_ruleParams.empty()) {
		return;
	}

	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	CalculateDuty(duties);
}

void CalculateDutyTimeForDelayedFlightRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}

	CalculateDuty(pairing->getDutyVec());
}

void CalculateDutyTimeForDelayedFlightRule::CalculateDuty(const vector<Duty*>& duties) {
	if (duties.empty()) {
		return;
	}

	std::string base; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duties.front()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	for (auto& duty : duties) {
		Segment* firstSeg = duty->getFirstSegment();
		if (firstSeg == nullptr) continue;
		if (SegmentUtils::IsActualTakeOff(firstSeg, this->GetDataContext())) {
			//航班实际起飞，不在重新计算Brief和Pickup
			continue;
		}

		for (const auto & ruleParam : _ruleParams) {
			if (!CalculateDuty(duty, base, ruleParam)) {
				break;
			}
		}
	}
}

bool CalculateDutyTimeForDelayedFlightRule::CalculateDuty(Duty* duty,
	const std::string& base, const CalculateDutyTimeForDelayedFlightRuleParam& ruleParam) {
	bool next = true;
	auto& dbData = this->GetDataContext();
	if (ruleParam.MatchParam(*duty, base)) {
		if (ruleParam._isUsedNewReportingTime) {
			//通过实际时间重新计算Brief和Pickup

			Segment* first = duty->getFirstSegment();

			auto brief = duty->getFirstBreif();
			if (dbData->systemParamMap["RE_CALC_BRIEF_WHILE_MANUAL_MODIFY"] == "Y" || brief->getIsManualModify() == 0 || duty->getBriefNeedRuleReCalc()) {
				//当未设置手工修改节点标志，才能重新计算Brief
				int briefMins = duty->getMinBrief() > 0 ? duty->getMinBrief() : duty->getActualBriefMin();
				brief->setStartLoc(brief->getEndLoc() - (time_t)briefMins * 60);
				brief->setStartUtc(brief->getEndUtc() - (time_t)briefMins * 60);
				duty->setActualBriefMin(briefMins);
			}
			brief->setEndLoc(first->getStartTimeLoc("ACT"));
			brief->setEndUtc(first->getStartTimeUtc("ACT"));

			auto pickup = duty->getFirstPickup();
			if (dbData->systemParamMap["RE_CALC_BRIEF_WHILE_MANUAL_MODIFY"] == "Y" || pickup->getIsManualModify() == 0 || duty->getBriefNeedRuleReCalc()) {
				pickup->setEndLoc(brief->getStartLoc());
				pickup->setEndUtc(brief->getStartUtc());
			}
			if (dbData->systemParamMap["RE_CALC_PICKUP_WHILE_MANUAL_MODIFY"] == "Y" || pickup->getIsManualModify() == 0) {
				int pickupMins = duty->getMinPickup() > 0 ? duty->getMinPickup() : duty->getActualPickupMin();
				pickup->setStartLoc(pickup->getEndLoc() - (time_t)pickupMins * 60);
				pickup->setStartUtc(pickup->getEndUtc() - (time_t)pickupMins * 60);
			}

			fixPairingAndDutyTime(duty, brief, pickup);
		}
		else
		{
			if (ruleParam._originalReportingTimeDelta != 0) {
				//通过计划时间重新计算Brief
				shared_ptr<PairingDutyNode> orgBrief = createBriefNodeOfDuty(duty, this->GetDataContext().get(), nullptr, "SCH");
				shared_ptr<PairingDutyNode> orgPickup = createPickupNodeOfDuty(duty, orgBrief, this->GetDataContext().get(), nullptr);

				//不使用新航班延误报告时间，则采用原时间，即 恢复Breif和Pickup节点时间
				int offsetTZMinutes = DutyUtils::GetTimeZoneOffsetByDep(*duty, this->GetDataContext());
				time_t breifStartUtc = orgBrief->getStartUtc() + ruleParam._originalReportingTimeDelta * 60;
				if (dbData->systemParamMap["RE_CALC_BRIEF_WHILE_MANUAL_MODIFY"] == "Y" || duty->getFirstBreif()->getIsManualModify() == 0 || duty->getBriefNeedRuleReCalc()) {
					//当未设置手工修改节点标志，才能重新计算Brief

					duty->getFirstBreif()->setStartUtc(breifStartUtc);
					//由于夏令时原因，本地时间会出现跳变，因此不能进行简单的增减，必须由UTC时间进行转换
					duty->getFirstBreif()->setStartLoc(breifStartUtc + offsetTZMinutes * 60);
				}

				time_t pickupStartUtc = orgPickup->getStartUtc() + ruleParam._originalReportingTimeDelta * 60;

				if (dbData->systemParamMap["RE_CALC_PICKUP_WHILE_MANUAL_MODIFY"] == "Y" || duty->getFirstPickup()->getIsManualModify() == 0) {
					duty->getFirstPickup()->setStartUtc(pickupStartUtc);
					duty->getFirstPickup()->setStartLoc(pickupStartUtc + offsetTZMinutes * 60);
				}

				if (dbData->systemParamMap["RE_CALC_BRIEF_WHILE_MANUAL_MODIFY"] == "Y" || duty->getFirstPickup()->getIsManualModify() == 0 || duty->getBriefNeedRuleReCalc()) {
					duty->getFirstPickup()->setEndUtc(duty->getFirstBreif()->getStartUtc());
					duty->getFirstPickup()->setEndLoc(duty->getFirstBreif()->getStartLoc());
				}

				fixPairingAndDutyTime(duty, duty->getFirstBreif(), duty->getFirstPickup());
			}
        }


		next = false;
	}
	return next;
}

void CalculateDutyTimeForDelayedFlightRule::ParseParam(const InputType& input) {
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculateDutyTimeForDelayedFlightRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CalculateDutyTimeForDelayedFlightRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void CalculateDutyTimeForDelayedFlightRule::fixPairingAndDutyTime(Duty* duty, shared_ptr<PairingDutyNode> brief, shared_ptr<PairingDutyNode> pickup) {
	duty->setStartTimeLocAct(brief->getStartLoc());
	duty->setStartTimeUtcAct(brief->getStartUtc());
	duty->setStartTimeLocSch(brief->getStartLoc());
	duty->setStartTimeUtcSch(brief->getStartUtc());

	auto iterPairing = this->GetDataContext()->pairingIdMap.find(duty->getPairingId());
	if (iterPairing != this->GetDataContext()->pairingIdMap.end()) {
		auto& pairing = iterPairing->second;
		pairing->setStartTimeLocAct(pickup->getStartLoc());
		pairing->setStartTimeUtcAct(pickup->getStartUtc());
		//pairing计划时间不变
		//pairing->setStartTimeLocSch(pickup->getStartLoc());
		//pairing->setStartTimeUtcSch(pickup->getStartUtc());
	}
}