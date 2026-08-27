/**
 * @file CheckStandardFdpExtensionRestRequirementRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CheckStandardFdpExtensionRestRequirementRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/SegmentUtils.h"
#include "index/TmProgramIndex.h"
#include "index/TmFootprintIndex.h"
#include "../period/WorkPeriod.h"


using namespace std;

void CheckStandardFdpExtensionRestRequirementRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
    map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
    string header, headeValue;
    for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
    {
        header = iter->first;
        headeValue = iter->second;
        if (header == "BASES") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _bases);
            }
        }
        else if (header == "RANKS") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _ranks);
            }
        }
        else if (header == "FLEETS") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _fleets);
            }
        }
        else if (header == "TEAMS") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _teams);
            }
        }
        else if (header == "COMPOSITIONS") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _compositions);
            }
        }
        else if (header == "OVERRIDE DUTY ATTRIBUTES") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _overrideDutyAttributes);
            }
        }
        else if (header == "EXTENDED REST DISTRIBUTION") {
            // 【ROSCRW-18845】【TG】【RULE】修改7359法规 支持设置多个EXTENDED REST DISTRIBUTION
            if (headeValue != RuleParamConstant::ALL) {
                std::vector<std::string> tokens;
                split(headeValue, '|', tokens);
                for (const auto& token : tokens) {
                    const std::string mode = strToUpper(trim(token));
                    if (!mode.empty()) {
                        _extendedRestDistributions.push_back(mode);
                    }
                }
            }
        }
        else if (header == "REST EXTENTION") {
            if (headeValue != RuleParamConstant::ALL) {
                _restExtention = hhmmStrToMinutes(headeValue);
            }
        }
        else
            Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
    }
}

bool CheckStandardFdpExtensionRestRequirementRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
    std::vector<string> positions;
    if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
        return true;
    return false;
}

bool CheckStandardFdpExtensionRestRequirementRuleParam::MatchRuleParam(const Duty* duty) const {
    if (!MatchComposition(duty)) {
		return false;
	}

    if (!MatchDutyAttributes(duty)) {
        return false;
    }

    return true;
}

bool CheckStandardFdpExtensionRestRequirementRuleParam::MatchComposition(const Duty* duty) const {

    if (_compositions.empty() || _compositions[0].empty() || _compositions[0] == "*")
		return true;

    string strComplement = duty->getCompositionName();
    if (strComplement == "")
    {
        strComplement = DutyUtils::GetCompositionByDutyFor3(duty, this->GetRule()->GetDataContext());
    }

    return find(_compositions.begin(), _compositions.end(), strComplement) != _compositions.end();
}

bool CheckStandardFdpExtensionRestRequirementRuleParam::MatchDutyAttributes(const Duty* duty) const {

    if (_overrideDutyAttributes.empty() || _overrideDutyAttributes[0].empty() || _overrideDutyAttributes[0] == "*")
        return true;

    if (duty->getAttributes().empty())
        return false;
    else {
        vector<string> attributes;
        split(duty->getAttributes(), '|', attributes);
        bool found = false;
        for (const auto& attr : _overrideDutyAttributes) {
            if (find(attributes.begin(), attributes.end(), attr) != attributes.end()) {
                found = true;
                break;
            }
        }
        if (!found) {
            return false;
        }
    }
    return true;
}

// 【ROSCRW-18845】【TG】【RULE】修改7359法规 支持设置多个EXTENDED REST DISTRIBUTION
bool CheckStandardFdpExtensionRestRequirementRuleParam::CheckExtendedRestDistributionForMode(
    const std::string& mode,
    time_t prevDutyRestEndTime,
    time_t nextDutyStartTime,
    time_t currentDutyStartTime,
    time_t currentDutyEndTime) const {
    if (mode == "BOTH") {
        bool halfMatch = true;
        const int halfRestExtention = _restExtention / 2;
        if ((prevDutyRestEndTime != 0 && (currentDutyStartTime - prevDutyRestEndTime) / 60 < halfRestExtention) ||
            (nextDutyStartTime != 0 && (nextDutyStartTime - currentDutyEndTime) / 60 < halfRestExtention)) {
            halfMatch = false;
        }
        bool afterMatch = true;
        if (nextDutyStartTime != 0 && (nextDutyStartTime - currentDutyEndTime) / 60 < _restExtention) {
            afterMatch = false;
        }
        // BOTH 满足前后均分或者任务后休时即可
        return halfMatch || afterMatch;
    }
    if (mode == "BEFORE") {
        if (prevDutyRestEndTime != 0 && (currentDutyStartTime - prevDutyRestEndTime) / 60 < _restExtention) {
            return false;
        }
        return true;
    }
    if (mode == "AFTER") {
        if (nextDutyStartTime != 0 && (nextDutyStartTime - currentDutyEndTime) / 60 < _restExtention) {
            return false;
        }
        return true;
    }
    // * 或其它：前后任一侧满足即可
    bool beforeOk = true;
    bool afterOk = true;
    if (prevDutyRestEndTime != 0 && (currentDutyStartTime - prevDutyRestEndTime) / 60 < _restExtention) {
        beforeOk = false;
    }
    if (nextDutyStartTime != 0 && (nextDutyStartTime - currentDutyEndTime) / 60 < _restExtention) {
        afterOk = false;
    }
    return beforeOk || afterOk;
}

bool CheckStandardFdpExtensionRestRequirementRuleParam::CheckExtendedRestDistribution(const shared_ptr<BaseActivityPeriod>& prevActivity, const shared_ptr<BaseActivityPeriod>& nextActivity, const Duty* duty) const {
    time_t prevDutyRestEndTime = 0;
    time_t nextDutyStartTime = 0;
    time_t currentDutyStartTime = duty->getStartTimeUtcAct() - duty->getActualPickupMin() * 60;
    time_t currentDutyEndTime = duty->getEndTimeUtcAct() + duty->getActualDropoffMin() * 60 + duty->getLimitationValue(RULE_LIMITATION_TYPE::MIN_REST) * 60;
    if (prevActivity && prevActivity->GetRoster()) {
        // Duty
        if (prevActivity->GetRoster()->pairing) {
            const auto& prevDuty = (Duty*)prevActivity->GetActivity();
            prevDutyRestEndTime = prevDuty->getEndTimeUtcAct() + prevDuty->getActualDropoffMin() * 60 + prevDuty->getLimitationValue(RULE_LIMITATION_TYPE::MIN_REST) * 60;
        }
        // Ground
        else {
            prevDutyRestEndTime = prevActivity->GetRoster()->getEndTimeUtcAct();
        }
    }

    if (nextActivity && nextActivity->GetRoster()) {
        //Duty
        if (nextActivity->GetRoster()->pairing) {
            const auto& nextDuty = (Duty*)nextActivity->GetActivity();
            nextDutyStartTime = nextDuty->getStartTimeUtcAct() - nextDuty->getActualPickupMin() * 60;
        }
        else {
            nextDutyStartTime = nextActivity->GetRoster()->getStartTimeUtcAct();
        }
    }

    // 【ROSCRW-18845】【TG】【RULE】修改7359法规 支持设置多个EXTENDED REST DISTRIBUTION：BOTH|AFTER
    if (_extendedRestDistributions.empty()) {
        return CheckExtendedRestDistributionForMode("*", prevDutyRestEndTime, nextDutyStartTime, currentDutyStartTime, currentDutyEndTime);
    }

    for (const auto& mode : _extendedRestDistributions) {
        if (CheckExtendedRestDistributionForMode(mode, prevDutyRestEndTime, nextDutyStartTime, currentDutyStartTime, currentDutyEndTime)) {
            return true;
        }
    }
    return false;
}