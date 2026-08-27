/**
 * @file RestrictMidDutyBaseTurnRule.h
 * @brief Rule 7460 - restrict mid-duty base turns for SQ.
 */

#ifndef _RESTRICTMIDDUTYBASETURNRULE_H_
#define _RESTRICTMIDDUTYBASETURNRULE_H_

#include <string>
#include <vector>

#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "RestrictMidDutyBaseTurnRuleParam.h"

class Segment;

class RestrictMidDutyBaseTurnRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7460;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface =
        RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit RestrictMidDutyBaseTurnRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, RestrictMidDutyBaseTurnRule::RuleFuncId, RestrictMidDutyBaseTurnRule::AvailableInterface) {
        ParseParam(input);
    }
    ~RestrictMidDutyBaseTurnRule() override = default;

    bool CheckRule(const Pairing* pairing) const override;

    bool CheckRule(const Duty* duty) const override;

    bool CheckPairingCountRule(const Pairing* pairing) const;

private:
    std::vector<RestrictMidDutyBaseTurnRuleParam> _restrictionParams;
    bool _isConfigured{false};

    void ParseParam(const InputType& input);

    bool CheckDutyRules(const std::vector<Duty*>& duties, bool reportViolations) const;
    bool DutyMatchesParamAndViolates(const Duty* duty,
                                     const RestrictMidDutyBaseTurnRuleParam& param,
                                     const Segment*& segment,
                                     std::string& baseStation) const;

    bool FindMidDutyBaseSegment(const Duty& duty,
                                const Segment*& segment,
                                std::string& baseStation) const;

    void ReportViolation(const Duty* duty,
                         const Segment* segment,
                         const std::string& baseStation,
                         const std::string& dutyStartStation,
                         const std::string& dutyEndStation) const;

    void ReportPairingCountViolation(const Duty* duty,
                                     const Segment* segment,
                                     const std::string& baseStation,
                                     const std::string& dutyStartStation,
                                     const std::string& dutyEndStation) const;

    void PrepareRuleViolation(const RestrictMidDutyBaseTurnRuleParam& matchedParam,
                              const std::string& baseStation,
                              const std::string& dutyStartStation,
                              const std::string& dutyEndStation) const;

    bool IsBaseStation(const std::string& value) const;
};

#endif //_RESTRICTMIDDUTYBASETURNRULE_H_
