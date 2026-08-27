#ifndef RULEENGINE_RULE7417_CHECKANRREPORTINGDEBRIEFRULE_H_
#define RULEENGINE_RULE7417_CHECKANRREPORTINGDEBRIEFRULE_H_

#include <vector>

#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "AnrReportingDebriefRuleParam.h"

class CheckAnrReportingDebriefRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = RULES::ANR_MIN_REPORTING_DEBRIEF;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface =
        RuleInterface::Interface::SingleDuty |
        RuleInterface::Interface::SinglePairing |
        RuleInterface::Interface::SingleCrew;
    constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

    explicit CheckAnrReportingDebriefRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, RuleFuncId, AvailableInterface),
          _param(this) {
        ParseParam(input);
    }
    ~CheckAnrReportingDebriefRule() override = default;

    bool CheckRule(const Duty* duty) const override;
    bool CheckRule(const Pairing* pairing) const override;
    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:
    void ParseParam(const InputType& input);
    bool checkDutyInternal(const Duty* duty, const ROSTER* roster) const;
    void throwViolation(const Duty* duty,
                        const ROSTER* roster,
                        const AnrReportingDebriefConfig& config,
                        int briefMinutes,
                        int debriefMinutes,
                        int totalMinutes,
                        const std::string& violated) const;

    AnrReportingDebriefRuleParam _param;
};

#endif  // RULEENGINE_RULE7417_CHECKANRREPORTINGDEBRIEFRULE_H_
