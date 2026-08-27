#include "CalculateMaxFlightDutyPeriodRule.h"
#include "Utility.h"

#include <ctime>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
// #include "orlog.h"
#include <OrLog.h>
#include "UtilDbg.h"
#include "StringUtil.h"
// #include "customBiz\customBiz.h"
#include "MaxFlightDutyPeriodRuleParam.h"
#include "../utils/DutyUtils.h"
#include "../constant/Constants.h"
#include "../utils//TimeUtils.h"
#include "../utils/PhaseUtils.h"

namespace {
std::string GetPairingBaseForDuty(const Duty* duty, const SharedPtr<CrewDataContext>& dbData) {
	if (duty == nullptr || dbData == nullptr) {
		return "";
	}

	const auto itPairing = dbData->pairingIdMap.find(duty->getPairingId());
	if (itPairing == dbData->pairingIdMap.end() || itPairing->second == nullptr) {
		return "";
	}

	return itPairing->second->getBase();
}

time_t AdjustCheckInByMaxFdpBrief(const Duty* duty, const SharedPtr<CrewDataContext>& dbData, time_t currentCheckInUtc) {
	if (duty == nullptr || dbData == nullptr) {
		return currentCheckInUtc;
	}

	const auto& brief = duty->getFirstBreif();
	// ROSCRW-18798 ：仅当brief被手动修改时才调整checkin时间，用(reportingTime + BriefDelta)匹配MaxFDP规则表
	if (!brief || !brief->getIsManualModify()) {
		return currentCheckInUtc;
	}

	const std::string pairingBase = GetPairingBaseForDuty(duty, dbData);
	const int normalBrief = RuleParams::CalculateDutyBrief(duty, dbData, pairingBase, RuleParams::DUTY_BRIEF_FIELD);
	const int maxFdpBrief = RuleParams::CalculateDutyBrief(duty, dbData, pairingBase, RuleParams::DUTY_MAX_FDP_BRIEF_FIELD);
	if (normalBrief < 0 || maxFdpBrief < 0) {
		return currentCheckInUtc;
	}

	return currentCheckInUtc + static_cast<time_t>(normalBrief - maxFdpBrief) * 60;
}
}

void CalculateMaxFlightDutyPeriodRule::CalculateDuty(Duty *duty) {
	if (this->_ruleParams.empty()) {
		return;
	}

	if (DutyUtils::IsAcclimation(duty, this->GetDataContext())) {
		this->CalculateAcclimatizeDuty(duty);
	}
	else {
		this->CalculateUnkownDuty(duty);
	}
}

void CalculateMaxFlightDutyPeriodRule::CalculateDuty(Duty* duty, const ROSTER* roster) {
	if (this->_ruleParams.empty()) {
		return;
	}

	if (DutyUtils::IsAcclimation(duty, this->GetDataContext())) {
		this->CalculateAcclimatizeDuty(duty);
	}
	else {
		this->CalculateUnkownDuty(duty, roster);
	}
}

// for po
void CalculateMaxFlightDutyPeriodRule::CalculateDuty(Pairing * pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}

	if (this->_application == PAIRING_OPTIMIZER) {
        for (size_t i = 0; i < pairing->getDutyVec().size(); i++) {
            auto duty = pairing->getDuty(i);
            if (DutyUtils::IsAcclimation(duty, this->GetDataContext())
                || pairing->getDutyVec().size() < 2) {
                this->CalculateAcclimatizeDuty(duty);
            }
            else {
                this->CalculateUnkownDuty((int)i, pairing);
            }
        }
    } else {
        for (auto& duty: pairing->getDutyVec()) {
            CalculateDuty(duty);
        }
    }
}

void CalculateMaxFlightDutyPeriodRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParams.empty()) {
		return;
	}

	for (auto roster : rosters) {
		for (auto duty : roster->pairing->getDutyVec()) {
			CalculateDuty(duty, roster);
		}
	}
}

//void CalculateMaxFlightDutyPeriodRule::CalculateAcclimatizeDuty(Duty *duty) {
//	for (const auto & _ruleParam : _ruleParams) {
//		if (_ruleParam._odpUpper != 0) continue;
//		CalculationManday FDP = this->_dbData->getCalculationManday("FDP");
//		CalculationManday ACT_FDP = this->_dbData->getCalculationManday("ACT FDP");
//		if (_ruleParam._maxFdp) {
//
//			//duty->calculateFDP(0, FDP.str, FDP.end);
//			//duty->calculateFDP(1, ACT_FDP.str, ACT_FDP.end);
//
//			time_t checkin = duty->getStartTimeUtcAct();
//
//			// 加上适应的时区秒数
//			checkin += duty->getRefTimeZone() * 60;
//
//			int landing = duty->getNumFlySegs();
//			string strComplement = duty->getCompositionName();
//			if (strComplement == "" || this->_application == PAIRING_EDITOR || this->_application == ROSTER_EDITOR)
//			{
//				strComplement = DutyUtils::GetCompositionByDutyFor3(duty, this->_dbData);
//				//strComplement = this->pairingCompositionCalculator->calculatePairingCompositionForPilotR5_3007(duty);
//				duty->setCompositionName(strComplement);
//			}
//
//			string strBase = duty->getDepStation();
//			bool bIsBunk = true;
//			auto offsetMinutes = this->_dbData->getAirportOffsetMinutes(strBase);
//
//			long fdp = duty->getFDPInSecs();
//			int rptStartMinutes = hhmmToMinutes(_ruleParam._rptStart.c_str());
//			int rptEndMinutes = hhmmToMinutes(_ruleParam._rptEnd.c_str());
//
//			bool isInRange = TimeUtils::IsTimesInRange(checkin, rptStartMinutes, rptEndMinutes);
//			if (isInRange && (landing <= _ruleParam._landingUpper && landing >= _ruleParam._landingLower) && (find(_ruleParam._compositions.begin(), _ruleParam._compositions.end(), strComplement) != _ruleParam._compositions.end())) {
//				duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, _ruleParam._maxFdp, _ruleParam.GetId(), _ruleParam->GetRuleParamId(), _ruleParam->GetOverrideAbility(), _ruleParam->GetClassType(), _ruleParam.GetDescription());
//
//			}
//		}
//	}
//}

void CalculateMaxFlightDutyPeriodRule::CalculateAcclimatizeDuty(Duty *duty) {

	MaxFlightDutyPeriodRuleParam* ruleParam = nullptr;

	//在航班延误时，采用修正FDP计划时间，获得能匹配规则
	MaxFlightDutyPeriodRuleParam* ruleParamByDelay = nullptr;
	MaxFlightDutyPeriodRuleParam* ruleParamByOriginal = nullptr;
	std::shared_ptr<max_fdp_after_delay_definition> matchedDelayDefinition = nullptr;
	
	auto maxFdpAfterDelayDefinitions = RuleParams::GetInstancePtr()->getMaxFDPAfterDelayDefinitions();
	for (auto& maxFdpAfterDelayDefinition : maxFdpAfterDelayDefinitions) {
		auto [originalCheckInTime, revisedCheckInTime] = GetDutyCheckInTime(duty, maxFdpAfterDelayDefinition);
		if (originalCheckInTime < 0 && revisedCheckInTime < 0) {
			continue;
		}
		
		// 根据revisedOrOriginalFDPStartTime的值进行处理
		if (maxFdpAfterDelayDefinition->revisedOrOriginalFDPStartTime == "RO") {
			matchedDelayDefinition = maxFdpAfterDelayDefinition;
			ruleParamByDelay = GetMatchedRuleWhenAcclimatize(duty, revisedCheckInTime);
			ruleParamByOriginal = GetMatchedRuleWhenAcclimatize(duty, originalCheckInTime);
			break;
		}
		else if (maxFdpAfterDelayDefinition->revisedOrOriginalFDPStartTime == "R") {
			ruleParamByDelay = GetMatchedRuleWhenAcclimatize(duty, revisedCheckInTime);
			break;
		}
		else if (maxFdpAfterDelayDefinition->revisedOrOriginalFDPStartTime == "O") {
			ruleParamByDelay = GetMatchedRuleWhenAcclimatize(duty, originalCheckInTime);
			break;
		}
	}

	if (matchedDelayDefinition != nullptr) {
		// revisedOrOriginalFDPStartTime==RO值：分别用原Reporting time和延迟Reporting Time计算Max FDP，取最小的Max FDP
		if (ruleParamByOriginal == nullptr) {
			ruleParam = ruleParamByDelay;
		}
		else if (ruleParamByDelay == nullptr) {
			ruleParam = ruleParamByOriginal;
		}
		else {
			// 取Max FDP较小的规则（更严格）
			ruleParam = (ruleParamByOriginal->_maxFdp < ruleParamByDelay->_maxFdp) ? ruleParamByOriginal : ruleParamByDelay;
		}
	}
	else if (ruleParamByDelay == nullptr) {
		//未找到航班延误，对应的规则，则采用FDP实际时间
		ruleParam = GetMatchedRuleWhenAcclimatize(duty, AdjustCheckInByMaxFdpBrief(duty, this->_dbData, duty->getStartTimeUtcAct()));
	}
	else {
		//通过原FDP计划时间（即计划Checkin时间），获得能匹配规则
		auto ruleParamBySch = GetMatchedRuleWhenAcclimatize(duty, AdjustCheckInByMaxFdpBrief(duty, this->_dbData, duty->getOriginalStartTimeUtcSch()));
		//匹配到多个规则，获取较严格规则（Max FDP越小则约严格）
		ruleParam = (ruleParamBySch == nullptr || ruleParamBySch->_maxFdp > ruleParamByDelay->_maxFdp) ? ruleParamByDelay : ruleParamBySch;
	}

	if (ruleParam != nullptr && ruleParam->_maxFdp > 0) {
		long fdp = duty->getFDPInSecs();
		int maxFdpToSet = ruleParam->_maxFdp;
		// ROSCRW-18798 ：手动修改reporting time时，最终MaxFDP需加上(Brief-MaxFdpBrief)差值
		maxFdpToSet += RuleParams::GetMaxFdpBriefDeltaMinutes(duty, this->_dbData, GetPairingBaseForDuty(duty, this->_dbData));
		if (!ruleParam->_overrideDutyAttributes.empty() && !ruleParam->_overrideDutyAttributes[0].empty() && ruleParam->_overrideDutyAttributes[0] != "*") {
			// 有duty attribute，则表示覆盖最大FDP
			duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, maxFdpToSet + ruleParam->_maxFdpExtension, ruleParam->GetId(), ruleParam->GetRuleParamId(), ruleParam->GetOverrideAbility(), ruleParam->GetClassType(), ruleParam->GetDescription(), ruleParam->GetReference(), true, true);
		}
		else {
			duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, maxFdpToSet, ruleParam->GetId(), ruleParam->GetRuleParamId(), ruleParam->GetOverrideAbility(), ruleParam->GetClassType(), ruleParam->GetDescription(), ruleParam->GetReference());
		}
	}
}

MaxFlightDutyPeriodRuleParam* CalculateMaxFlightDutyPeriodRule::GetMatchedRuleWhenAcclimatize(Duty *duty, const time_t checkInTime) {
	MaxFlightDutyPeriodRuleParam* resultRuleParam = nullptr;
	for (auto & _ruleParam : _ruleParams) {
		if (_ruleParam._odpUpper != 0) continue;


		if (duty != nullptr && !PhaseUtils::IsChecked(duty, _ruleParam.GetPhase(), this->_dbData)) {
			continue;
		}

		CalculationManday FDP = this->_dbData->getCalculationManday("FDP");
		CalculationManday ACT_FDP = this->_dbData->getCalculationManday("ACT FDP");
		if (_ruleParam._maxFdp) {

			//duty->calculateFDP(0, FDP.str, FDP.end);
			//duty->calculateFDP(1, ACT_FDP.str, ACT_FDP.end);

			time_t checkin = checkInTime;// GetDutyCheckinTime(duty, maxFdpAfterDelayDefinition);

			// 加上适应的时区秒数
			checkin += duty->getRefTimeZone() * 60;

			int landing = GetDutyLandingNumber(duty, _ruleParam._landingAssignments);
			string strComplement = duty->getCompositionName();
			if (strComplement == "" || this->_application == PAIRING_EDITOR || this->_application == ROSTER_EDITOR)
			{
				strComplement = DutyUtils::GetCompositionByDutyFor3(duty, this->_dbData);
				//strComplement = this->pairingCompositionCalculator->calculatePairingCompositionForPilotR5_3007(duty);
				duty->setCompositionName(strComplement);
			}

			string strBase = duty->getDepStation();
			bool bIsBunk = true;
			auto offsetMinutes = this->_dbData->getAirportOffsetMinutes(strBase);

			long fdp = duty->getFDPInSecs();
			int rptStartMinutes = hhmmToMinutes(_ruleParam._rptStart.c_str());
			int rptEndMinutes = hhmmToMinutes(_ruleParam._rptEnd.c_str());

			bool matchDutyAttributes = _ruleParam.MatchDutyAttributes(duty);

			bool isInRange = TimeUtils::IsTimesInRange(checkin, rptStartMinutes, rptEndMinutes);
			if (isInRange && matchDutyAttributes && (landing <= _ruleParam._landingUpper && landing >= _ruleParam._landingLower) && (_ruleParam._compositions.size() == 0 || _ruleParam._compositions[0] == "*" || find(_ruleParam._compositions.begin(), _ruleParam._compositions.end(), strComplement) != _ruleParam._compositions.end())) {
				if (resultRuleParam == nullptr || IsReplaceRuleParam(*resultRuleParam, _ruleParam)) {
					//返回最严格的规则（即maxFDP最小的规则）
					resultRuleParam = &_ruleParam;
				}
			}
		}
	}
	return resultRuleParam;
}

bool CalculateMaxFlightDutyPeriodRule::IsReplaceRuleParam(const MaxFlightDutyPeriodRuleParam before, const MaxFlightDutyPeriodRuleParam current) const {
	bool beforeIsOverride = false;
	if (!before._overrideDutyAttributes.empty() && before._overrideDutyAttributes[0] != "*" && !before._overrideDutyAttributes[0].empty())
		beforeIsOverride = true;

	bool currentIsOverride = false;
	if (!current._overrideDutyAttributes.empty() && current._overrideDutyAttributes[0] != "*" && !current._overrideDutyAttributes[0].empty())
		currentIsOverride = true;
	
	if (beforeIsOverride == currentIsOverride && before._maxFdp > current._maxFdp)
		return true;
	
	if (!beforeIsOverride && currentIsOverride)
		return true;
		
	return false;
}

std::tuple<time_t,time_t> CalculateMaxFlightDutyPeriodRule::GetDutyCheckInTime(const Duty* duty, const std::shared_ptr<max_fdp_after_delay_definition>& maxFdpAfterDelayDefinition) {
    time_t originalCheckInTime = -1, revisedCheckInTime = -1;
    if (maxFdpAfterDelayDefinition == nullptr) {
        return {originalCheckInTime, revisedCheckInTime};
    }
    if (maxFdpAfterDelayDefinition->revisedOrOriginalFDPStartTime == "*") {
        return {originalCheckInTime, revisedCheckInTime};
    }
    Segment *firstSegemnt = duty->getFirstSegment();
    int delay = static_cast<int>(firstSegemnt->getStartTimeUtcAct() - firstSegemnt->getStartTimeUtcSch());
    if (delay <= 0) {
        return {originalCheckInTime, revisedCheckInTime};
    }
    
    // 检查延误时间是否在总延误时间范围内
    bool delayInRange = (delay >= maxFdpAfterDelayDefinition->totalFlightDelayMinutesLower * 60
        && delay < maxFdpAfterDelayDefinition->totalFlightDelayMinutesUpper * 60);
    
    if (!delayInRange) {
        return {originalCheckInTime, revisedCheckInTime};
    }
    
    // 检查Amount of Notification Ranges（如果设置了）
    if (maxFdpAfterDelayDefinition->amountOfNotificationRanges != "" 
        && maxFdpAfterDelayDefinition->amountOfNotificationRanges != "*") {
        // 获取最新的reporting time
        time_t latestReportingTime;
        if (duty->getFirstBreif() == nullptr) {
            latestReportingTime = duty->getStartTimeUtcAct();
        } else {
            latestReportingTime = duty->getFirstBreif()->getStartTimeUtcAct();
        }
        
        // 检查通知时间是否发生在最新reporting time之前
        if (firstSegemnt->getFltDelayNotifyUtc() <= 0) {
            // 航班未发生延误通知
            return {originalCheckInTime, revisedCheckInTime};
        }
        
        if (firstSegemnt->getFltDelayNotifyUtc() >= latestReportingTime) {
            // 通知时间没有发生在最新reporting time之前，不满足条件
            return {originalCheckInTime, revisedCheckInTime};
        }
        
        // 计算通知时间与reporting time之间的时间差
        int amountOfNotify = static_cast<int>(latestReportingTime - firstSegemnt->getFltDelayNotifyUtc());
        
        // 检查通知时间差是否在范围内
        if (amountOfNotify < maxFdpAfterDelayDefinition->amountOfNotificationMinutesLower * 60
            || amountOfNotify >= maxFdpAfterDelayDefinition->amountOfNotificationMinutesUpper * 60) {
            // 通知时间差不在范围内
            return {originalCheckInTime, revisedCheckInTime};
        }
    }
    
    // 计算两个时间
    originalCheckInTime = AdjustCheckInByMaxFdpBrief(duty, this->_dbData, duty->getOriginalStartTimeUtcSch()) + maxFdpAfterDelayDefinition->fdpStartTimeDeltaMinutes * 60;
    revisedCheckInTime = AdjustCheckInByMaxFdpBrief(duty, this->_dbData, duty->getStartTimeUtcAct()) + maxFdpAfterDelayDefinition->fdpStartTimeDeltaMinutes * 60;
    
    return {originalCheckInTime, revisedCheckInTime};
}

//void CalculateMaxFlightDutyPeriodRule::CalculateUnkownDuty(Duty* duty, const ROSTER* roster) {
//	// 获取前一个任务的ODP
//	long beforeDutyODP = 0;
//
//	int rosterIndex = 0;
//	if (roster) rosterIndex = roster->indexInRosterListOfCrew;
//	// 如果是第一个duty，找前一个pairing的lastDuty
//	// 如果没有roster，无法确定crew，无法找到前序任务，则默认是适应
//	// 如果roster是第一个，无前序任务，则默认适应
//
//	if (this->_application == PAIRING_EDITOR) {
//		this->CalculateAcclimatizeDuty(duty);
//	} else if (duty->getDutySeq() == 1 && (roster == NULL || rosterIndex == 0)) {
//		this->CalculateAcclimatizeDuty(duty);
//		return;
//	}
//	else if (duty->getDutySeq() == 1) {
//		
//		const auto & prevPairing = this->_dbData->crewIdMap.at(roster->idcrew)->rosterList.at(rosterIndex - 1)->pairing;
//		const auto & prevLastDuty = prevPairing->getLastDuty();
//
//		beforeDutyODP = static_cast<long>(duty->getStartTimeUtcAct() - prevLastDuty->getEndTimeUtcAct());
//	}
//	// 查找同一个pairing里，前一个duty
//	else {
//		const auto & pairing = this->_dbData->pairingIdMap.at(duty->getPairingId());
//		const auto & prevDuty = pairing->getDuty(duty->getDutySeq() - 2);
//		beforeDutyODP = static_cast<long>(duty->getStartTimeUtcAct() - prevDuty->getEndTimeUtcAct());
//	}
//	int landing = duty->getNumFlySegs();
//	long fdp = duty->getFDPInSecs();
//
//	string strComplement = duty->getCompositionName();
//	if (strComplement == "" || this->_application == PAIRING_EDITOR || this->_application == ROSTER_EDITOR)
//	{
//		strComplement = DutyUtils::GetCompositionByDutyFor3(const_cast<Duty*>(duty), this->_dbData);
//		//strComplement = this->pairingCompositionCalculator->calculatePairingCompositionForPilotR5_3007(duty);
//		//duty->setCompositionName(strComplement);
//	}
//	for (const auto & _ruleParam : _ruleParams) {
//		if (_ruleParam._odpUpper != 0) {
//			if (_ruleParam._odpLower * 3600 <= beforeDutyODP && _ruleParam._odpUpper * 3600 > beforeDutyODP
//				&& landing <= _ruleParam._landingUpper && landing >= _ruleParam._landingLower
//				&& (strComplement == "" || (!_ruleParam._compositions.empty() && _ruleParam._compositions.at(0) == "*"
//					) || find(_ruleParam._compositions.begin(), _ruleParam._compositions.end(), strComplement) != _ruleParam._compositions.end())) {
//				if (_ruleParam._maxFdp > 0)
//					duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, _ruleParam._maxFdp, _ruleParam.GetId(), _ruleParam->GetRuleParamId(), _ruleParam->GetOverrideAbility(), _ruleParam->GetClassType(), _ruleParam.GetDescription());
//				if (_ruleParam._maxDp > 0)
//					duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_DP, _ruleParam._maxDp, _ruleParam.GetId(), _ruleParam->GetRuleParamId(), _ruleParam->GetOverrideAbility(), _ruleParam->GetClassType(), _ruleParam.GetDescription());
//				if (_ruleParam._maxFt > 0)
//					duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_BLOCK, _ruleParam._maxFt, _ruleParam.GetId(), _ruleParam->GetRuleParamId(), _ruleParam->GetOverrideAbility(), _ruleParam->GetClassType(), _ruleParam.GetDescription());
//			}
//		}
//	}
//}

/////////

void CalculateMaxFlightDutyPeriodRule::CalculateUnkownDuty(int dutyIndex, Pairing * pairing) {

	auto duty = pairing->getDuty(dutyIndex);

	if (pairing->getDutyVec().size() < 2) {
		this->CalculateAcclimatizeDuty(duty);
		return;
	}
	MaxFlightDutyPeriodRuleParam* ruleParam = nullptr;

	//在航班延误时，采用修正FDP计划时间，获得能匹配规则
	MaxFlightDutyPeriodRuleParam* ruleParamByDelay = nullptr;
	MaxFlightDutyPeriodRuleParam* ruleParamByOriginal = nullptr;
	std::shared_ptr<max_fdp_after_delay_definition> matchedDelayDefinition = nullptr;
	
	auto& maxFdpAfterDelayDefinitions = RuleParams::GetInstancePtr()->getMaxFDPAfterDelayDefinitions();
	for (auto& maxFdpAfterDelayDefinition : maxFdpAfterDelayDefinitions) {
		auto [originalCheckInTime, revisedCheckInTime] = GetDutyCheckInTime(duty, maxFdpAfterDelayDefinition);
		if (originalCheckInTime < 0 && revisedCheckInTime < 0) {
			continue;
		}
		
		// 根据revisedOrOriginalFDPStartTime的值进行处理
		if (maxFdpAfterDelayDefinition->revisedOrOriginalFDPStartTime == "RO") {
			matchedDelayDefinition = maxFdpAfterDelayDefinition;
			ruleParamByDelay = GetMatchedRuleWhenAcclimatize(duty, revisedCheckInTime);
			ruleParamByOriginal = GetMatchedRuleWhenAcclimatize(duty, originalCheckInTime);
			break;
		}
		else if (maxFdpAfterDelayDefinition->revisedOrOriginalFDPStartTime == "R") {
			ruleParamByDelay = GetMatchedRuleWhenAcclimatize(duty, revisedCheckInTime);
			break;
		}
		else if (maxFdpAfterDelayDefinition->revisedOrOriginalFDPStartTime == "O") {
			ruleParamByDelay = GetMatchedRuleWhenAcclimatize(duty, originalCheckInTime);
			break;
		}
	}

	if (matchedDelayDefinition != nullptr) {
		// revisedOrOriginalFDPStartTime==RO值：分别用原Reporting time和延迟Reporting Time计算Max FDP，取最小的Max FDP
		if (ruleParamByOriginal == nullptr) {
			ruleParam = ruleParamByDelay;
		}
		else if (ruleParamByDelay == nullptr) {
			ruleParam = ruleParamByOriginal;
		}
		else {
			// 取Max FDP较小的规则（更严格）
			ruleParam = (ruleParamByOriginal->_maxFdp < ruleParamByDelay->_maxFdp) ? ruleParamByOriginal : ruleParamByDelay;
		}
	}
	else if (ruleParamByDelay == nullptr) {
		//未找到航班延误，对应的规则，则采用FDP实际时间
		ruleParam = GetMatchedRuleWhenUnknown(dutyIndex, pairing, AdjustCheckInByMaxFdpBrief(duty, this->_dbData, duty->getStartTimeUtcAct()));
	}
	else {
		//通过FDP计划时间（即计划Checkin时间），获得能匹配规则
		auto ruleParamBySch = GetMatchedRuleWhenUnknown(dutyIndex, pairing, AdjustCheckInByMaxFdpBrief(duty, this->_dbData, duty->getStartTimeUtcSch()));
		//匹配到多个规则，获取较严格规则（Max FDP越小则约严格）
		ruleParam = (ruleParamBySch == nullptr || ruleParamBySch->_maxFdp > ruleParamByDelay->_maxFdp) ? ruleParamByDelay : ruleParamBySch;
	}

	if (ruleParam != nullptr && ruleParam->_maxFdp > 0) {
		duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, ruleParam->_maxFdp, ruleParam->GetId(), ruleParam->GetRuleParamId(), ruleParam->GetOverrideAbility(), ruleParam->GetClassType(), ruleParam->GetDescription(), ruleParam->GetReference());
	}
}

void CalculateMaxFlightDutyPeriodRule::CalculateUnkownDuty(Duty* duty, const ROSTER* roster) {
	
	int rosterIndex = 0;
	if (roster) rosterIndex = roster->indexInRosterListOfCrew;
	// 如果是第一个duty，找前一个pairing的lastDuty
	// 如果没有roster，无法确定crew，无法找到前序任务，则默认是适应
	// 如果roster是第一个，无前序任务，则默认适应

	if (this->_application == PAIRING_EDITOR) {
		this->CalculateAcclimatizeDuty(duty);
		return;
	}
	else if (duty->getDutySeq() == 1 && (roster == NULL || rosterIndex == 0)) {
		this->CalculateAcclimatizeDuty(duty);
		return;
	}

	MaxFlightDutyPeriodRuleParam* ruleParam = nullptr;

	//在航班延误时，采用修正FDP计划时间，获得能匹配规则
	MaxFlightDutyPeriodRuleParam* ruleParamByDelay = nullptr;
	MaxFlightDutyPeriodRuleParam* ruleParamByOriginal = nullptr;
	std::shared_ptr<max_fdp_after_delay_definition> matchedDelayDefinition = nullptr;
	
	auto maxFdpAfterDelayDefinitions = RuleParams::GetInstancePtr()->getMaxFDPAfterDelayDefinitions();
	for (auto& maxFdpAfterDelayDefinition : maxFdpAfterDelayDefinitions) {
		auto [originalCheckInTime, revisedCheckInTime] = GetDutyCheckInTime(duty, maxFdpAfterDelayDefinition);
		if (originalCheckInTime < 0 && revisedCheckInTime < 0) {
			continue;
		}
		
		// 根据revisedOrOriginalFDPStartTime的值进行处理
		if (maxFdpAfterDelayDefinition->revisedOrOriginalFDPStartTime == "RO") {
			matchedDelayDefinition = maxFdpAfterDelayDefinition;
			ruleParamByDelay = GetMatchedRuleWhenAcclimatize(duty, revisedCheckInTime);
			ruleParamByOriginal = GetMatchedRuleWhenAcclimatize(duty, originalCheckInTime);
			break;
		}
		else if (maxFdpAfterDelayDefinition->revisedOrOriginalFDPStartTime == "R") {
			ruleParamByDelay = GetMatchedRuleWhenAcclimatize(duty, revisedCheckInTime);
			break;
		}
		else if (maxFdpAfterDelayDefinition->revisedOrOriginalFDPStartTime == "O") {
			ruleParamByDelay = GetMatchedRuleWhenAcclimatize(duty, originalCheckInTime);
			break;
		}
	}


	if (matchedDelayDefinition != nullptr) {
		// revisedOrOriginalFDPStartTime==RO值：分别用原Reporting time和延迟Reporting Time计算Max FDP，取最小的Max FDP
		if (ruleParamByOriginal == nullptr) {
			ruleParam = ruleParamByDelay;
		}
		else if (ruleParamByDelay == nullptr) {
			ruleParam = ruleParamByOriginal;
		}
		else {
			// 取Max FDP较小的规则（更严格）
			ruleParam = (ruleParamByOriginal->_maxFdp < ruleParamByDelay->_maxFdp) ? ruleParamByOriginal : ruleParamByDelay;
		}
	}
	else if (ruleParamByDelay == nullptr) {
		//未找到航班延误，对应的规则，则采用FDP实际时间
		ruleParam = GetMatchedRuleWhenUnknown(duty, roster, AdjustCheckInByMaxFdpBrief(duty, this->_dbData, duty->getStartTimeUtcAct()));
	}
	else {
		//通过FDP计划时间（即计划Checkin时间），获得能匹配规则
		auto ruleParamBySch = GetMatchedRuleWhenUnknown(duty, roster, AdjustCheckInByMaxFdpBrief(duty, this->_dbData, duty->getStartTimeUtcSch()));
		//匹配到多个规则，获取较严格规则（Max FDP越小则约严格）
		ruleParam = (ruleParamBySch == nullptr || ruleParamBySch->_maxFdp > ruleParamByDelay->_maxFdp) ? ruleParamByDelay : ruleParamBySch;
	}

	if (ruleParam != nullptr && ruleParam->_maxFdp > 0) {
		if (!ruleParam->_overrideDutyAttributes.empty() && !ruleParam->_overrideDutyAttributes[0].empty() && ruleParam->_overrideDutyAttributes[0] != "*") {
			// 有duty attribute，则表示覆盖最大FDP
			duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, ruleParam->_maxFdp + ruleParam->_maxFdpExtension, ruleParam->GetId(), ruleParam->GetRuleParamId(), ruleParam->GetOverrideAbility(), ruleParam->GetClassType(), ruleParam->GetDescription(), ruleParam->GetReference(), true, true);
		}
		else {
			duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, ruleParam->_maxFdp, ruleParam->GetId(), ruleParam->GetRuleParamId(), ruleParam->GetOverrideAbility(), ruleParam->GetClassType(), ruleParam->GetDescription(), ruleParam->GetReference());
		}
	}
}

// pairing中只有一个duty不会进入unknow
MaxFlightDutyPeriodRuleParam*  CalculateMaxFlightDutyPeriodRule::GetMatchedRuleWhenUnknown(int dutyIndex, const Pairing* pairing, const time_t checkInTime) {
	MaxFlightDutyPeriodRuleParam* resultRuleParam = nullptr;

	//time_t dutyCheckInTime = duty->getStartTimeUtcAct();
	time_t dutyCheckInTime = checkInTime;
	// 获取前一个任务的ODP
	long beforeDutyODP = 0;

	const auto & prevDuty = pairing->getDuty(dutyIndex - 1);
	beforeDutyODP = static_cast<long>(dutyCheckInTime - prevDuty->getEndTimeUtcAct());

	const auto & duty = pairing->getDuty(dutyIndex);



	string strComplement = duty->getCompositionName();
	if (strComplement == "" || this->_application == PAIRING_EDITOR || this->_application == ROSTER_EDITOR)
	{
		strComplement = DutyUtils::GetCompositionByDutyFor3(const_cast<Duty*>(duty), this->_dbData);
		//strComplement = this->pairingCompositionCalculator->calculatePairingCompositionForPilotR5_3007(duty);
		//duty->setCompositionName(strComplement);
	}
	for (auto & _ruleParam : _ruleParams) {
		int landing = GetDutyLandingNumber(duty, _ruleParam._landingAssignments);
		if (_ruleParam._odpUpper != 0) {
			if (_ruleParam._odpLower * 3600 <= beforeDutyODP && _ruleParam._odpUpper * 3600 > beforeDutyODP
				&& landing <= _ruleParam._landingUpper && landing >= _ruleParam._landingLower
				&& (strComplement == "" || (!_ruleParam._compositions.empty() && _ruleParam._compositions.at(0) == "*"
					) || find(_ruleParam._compositions.begin(), _ruleParam._compositions.end(), strComplement) != _ruleParam._compositions.end())) {
				if (resultRuleParam == nullptr || resultRuleParam->_maxFdp > _ruleParam._maxFdp) {
					//返回最严格的规则（即maxFDP最小的规则）
					resultRuleParam = &_ruleParam;
				}
			}
		}
	}
	return resultRuleParam;
}

MaxFlightDutyPeriodRuleParam*  CalculateMaxFlightDutyPeriodRule::GetMatchedRuleWhenUnknown(Duty* duty, const ROSTER* roster, const time_t checkInTime) {
	MaxFlightDutyPeriodRuleParam* resultRuleParam = nullptr;

	//time_t dutyCheckInTime = duty->getStartTimeUtcAct();
	time_t dutyCheckInTime = checkInTime;
	// 获取前一个任务的ODP
	long beforeDutyODP = 0;

	int rosterIndex = 0;
	if (roster) rosterIndex = roster->indexInRosterListOfCrew;
	// 如果是第一个duty，找前一个pairing的lastDuty
	// 如果没有roster，无法确定crew，无法找到前序任务，则默认是适应
	// 如果roster是第一个，无前序任务，则默认适应

	if (duty->getDutySeq() == 1) {
		SharedPtr<ROSTER> prevRoster = this->_dbData->crewIdMap.at(roster->idcrew)->rosterList.at(rosterIndex - 1);
		const auto & prevPairing = prevRoster->pairing;
		if (prevPairing == nullptr) {
			//地面任务
			beforeDutyODP = static_cast<long>(dutyCheckInTime - prevRoster->getRestStartUtcAct());
		}
		else {
			//非地面任务
			const auto& prevLastDuty = prevPairing->getLastDuty();
			beforeDutyODP = static_cast<long>(dutyCheckInTime - prevLastDuty->getEndTimeUtcAct());
		}
	}
	// 查找同一个pairing里，前一个duty
	else {
		const auto & pairing = this->_dbData->pairingIdMap.at(duty->getPairingId());
		const auto & prevDuty = pairing->getDuty(duty->getDutySeq() - 2);
		beforeDutyODP = static_cast<long>(dutyCheckInTime - prevDuty->getEndTimeUtcAct());
	}

	string strComplement = duty->getCompositionName();
	if (strComplement == "" || this->_application == PAIRING_EDITOR || this->_application == ROSTER_EDITOR)
	{
		strComplement = DutyUtils::GetCompositionByDutyFor3(const_cast<Duty*>(duty), this->_dbData);
		//strComplement = this->pairingCompositionCalculator->calculatePairingCompositionForPilotR5_3007(duty);
		//duty->setCompositionName(strComplement);
	}
	for (auto & _ruleParam : _ruleParams) {
		if (duty != nullptr && !PhaseUtils::IsChecked(duty, _ruleParam.GetPhase(), this->_dbData)) {
			continue;
		}
		int landing = GetDutyLandingNumber(duty, _ruleParam._landingAssignments);
		bool matchDutyAttributes = _ruleParam.MatchDutyAttributes(duty);
		if (_ruleParam._odpUpper != 0) {
			if (_ruleParam._odpLower * 3600 <= beforeDutyODP && _ruleParam._odpUpper * 3600 > beforeDutyODP
				&& matchDutyAttributes
				&& landing <= _ruleParam._landingUpper && landing >= _ruleParam._landingLower
				&& (strComplement == "" || (!_ruleParam._compositions.empty() && _ruleParam._compositions.at(0) == "*"
					) || find(_ruleParam._compositions.begin(), _ruleParam._compositions.end(), strComplement) != _ruleParam._compositions.end())) {
				if (resultRuleParam == nullptr || resultRuleParam->_maxFdp > _ruleParam._maxFdp) {
					//返回最严格的规则（即maxFDP最小的规则）
					resultRuleParam = &_ruleParam;
				}
			}
		}
	}
	return resultRuleParam;
}

void CalculateMaxFlightDutyPeriodRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(MaxFlightDutyPeriodRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}

int CalculateMaxFlightDutyPeriodRule::GetDutyLandingNumber(const Duty* duty, std::vector<std::string> landingAssignments) const {
	if (landingAssignments.size() == 0 )
		return duty->getNumFlySegs();

	if (landingAssignments.at(0) == "*")
		return (int)duty->getSegments().size();

	int num = 0;
	for (const auto & seg : duty->getSegments()) {
		if (find(landingAssignments.begin(), landingAssignments.end(), seg->getAssignment()) != landingAssignments.end())
			++num;
	}
	return num;
}
