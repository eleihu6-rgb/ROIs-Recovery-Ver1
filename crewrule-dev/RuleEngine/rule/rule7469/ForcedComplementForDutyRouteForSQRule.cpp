/**
 * @file ForcedComplementForDutyRouteForSQRule.cpp
 */

#include "ForcedComplementForDutyRouteForSQRule.h"

#include <algorithm>

#include "../RuleSytem.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"

using namespace std;

bool ForcedComplementForDutyRouteForSQRule::CheckRule(const Pairing* pairing) const {
    if (pairing == nullptr || _ruleParams.empty()) {
        return true;
    }
    bool passAll = true;
    for (const auto* duty : pairing->getDutyVec()) {
        if (!CheckRule(duty)) {
            passAll = false;
            if (!IsCheckAllRule()) {
                break;
            }
        }
    }
    return passAll;
}

bool ForcedComplementForDutyRouteForSQRule::CheckRule(const Duty* duty) const {
    if (duty == nullptr || _ruleParams.empty()) {
        return true;
    }

    bool passAll = true;
    const auto& dbData = GetDataContext();
    for (const auto& param : _ruleParams) {
        std::vector<const Segment*> operatingSegments;
        std::string route;

        if (!param.MatchServiceType(duty)) {
            continue;
        }
        if (!param.MatchDutyRoute(duty, route, operatingSegments)) {
            continue;
        }
        if (!param.MatchFleets(operatingSegments)) {
            continue;
        }
        if (!param.MatchFleetGroups(operatingSegments, dbData.get())) {
            continue;
        }
        const bool compositionOk = param.MatchComposition(duty, dbData.get());
        const bool rankPlanOk = param.MatchRankPlan(operatingSegments, dbData.get());
        if (!(compositionOk && rankPlanOk)) {
            _ruleViolation.SetParam("route", route);
            _ruleViolation.SetParam("require_composition", param.GetCompositionLabel());
            _ruleViolation.SetParam("require_rank_plan", param.GetRankPlanLabel());
            _ruleViolation.SetParam("composition", ResolveDutyComposition(duty));
            ThrowRuleViolation(duty, param, route, compositionOk, rankPlanOk);
            passAll = false;
            if (!IsCheckAllRule()) {
                break;
            }
        }
    }

    return passAll;
}

void ForcedComplementForDutyRouteForSQRule::ParseParam(const InputType& input) {
    for (const auto& dbRule : input.dbRules) {
        if (dbRule.function != RuleFuncId) {
            continue;
        }
        _ruleParams.emplace_back(ForcedComplementForDutyRouteForSQRuleParam(this));
        _ruleParams.back().ParseParam(dbRule);
    }
    if (!_ruleParams.empty()) {
        return;
    }
    for (const auto& paramString : input.ruleParamString) {
        _ruleParams.emplace_back(ForcedComplementForDutyRouteForSQRuleParam(this));
        _ruleParams.back().ParseParam(paramString);
    }
}

std::string ForcedComplementForDutyRouteForSQRule::ResolveDutyComposition(const Duty* duty) const {
    if (duty == nullptr) {
        return {};
    }
    std::string composition = duty->getCompositionName();
    if ((composition.empty() || IsEditorModel()) && this->_dbData != nullptr) {
        composition = DutyUtils::GetCompositionByDutyFor3(const_cast<Duty*>(duty), this->_dbData);
    }
    return composition;
}

void ForcedComplementForDutyRouteForSQRule::ThrowRuleViolation(const Duty* duty,
                                                               const ForcedComplementForDutyRouteForSQRuleParam& param,
                                                               const std::string& route,
                                                               bool compositionOk,
                                                               bool rankPlanOk) const {
    std::vector<std::string> requirements;
    if (param.HasCompositionRequirement()) {
        requirements.push_back("composition " + param.GetCompositionLabel());
    }
    if (param.HasRankPlanRequirement()) {
        requirements.push_back("rank plan " + param.GetRankPlanLabel());
    }

    std::string requirementText;
    for (size_t i = 0; i < requirements.size(); ++i) {
        if (i > 0) {
            requirementText += " and ";
        }
        requirementText += requirements[i];
    }

    std::string msg;
    if (!requirementText.empty()) {
        msg = "Duty route (" + route + ") requires " + requirementText + ".";
    } else {
        msg = "Duty route (" + route + ") violates forced complement requirement.";
    }

    if (!compositionOk && param.HasCompositionRequirement()) {
        msg += " Composition does not match.";
    }
    if (!rankPlanOk && param.HasRankPlanRequirement()) {
        msg += " Rank plan does not match.";
    }

    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->idRule = ForcedComplementForDutyRouteForSQRule::RuleFuncId;
    rv->pairingId = duty->getPairingId();
    rv->dutySequenceNumber = duty->getDutySegNum();
    rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
    rv->startDTUtc = duty->getStartTimeUtcAct();
    rv->endDTUtc = duty->getEndTimeUtcAct();
    rv->violation_msg = msg;

    _ruleViolation.SetLegalityMessage(const_cast<Duty*>(duty), msg, ForcedComplementForDutyRouteForSQRule::RuleFuncId);
    rv->operation_result.insert(pair<string, string>("ruleId", StringUtils::lltos(rv->idRule)));
    rv->operation_result.insert(pair<string, string>("route", route));
    if (param.HasCompositionRequirement()) {
        rv->operation_result.insert(pair<string, string>("require_composition", param.GetCompositionLabel()));
    }
    if (param.HasRankPlanRequirement()) {
        rv->operation_result.insert(pair<string, string>("require_rank_plan", param.GetRankPlanLabel()));
    }

    _ruleViolation.AddRuleViolations(rv);
}
