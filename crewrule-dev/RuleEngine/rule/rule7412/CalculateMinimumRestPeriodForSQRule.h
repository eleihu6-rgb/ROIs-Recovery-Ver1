#ifndef CREWRULE_CALCULATEMINIMUMRESTPERIODFORSQRULE_H
#define CREWRULE_CALCULATEMINIMUMRESTPERIODFORSQRULE_H

#include <vector>
#include <utility>

#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckMinimumRestPeriodForSQRuleParam.h"

class CalculateMinimumRestPeriodForSQRule : public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = RULES::CHECK_MINIMUM_REST_PERIOD_FOR_SQ;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit CalculateMinimumRestPeriodForSQRule(const RuleSystem* system, const InputType& input)
            : CalculateRule(system, CalculateMinimumRestPeriodForSQRule::RuleFuncId, CalculateMinimumRestPeriodForSQRule::AvailableInterface) {
        ParseParam(input);
    }

    ~CalculateMinimumRestPeriodForSQRule() override = default;

    void CalculateDuty(Duty* duty) override;

    void CalculateDuty(Pairing* pairing) override;

    void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

 private:
    struct RuleInstance {
        long long ruleId{0};
        MinRest7412ControlParam control{};
        std::vector<CheckMinimumRestPeriodForSQRuleParam> params{};
    };

    std::vector<RuleInstance> _ruleInstances;

    void ParseParam(const InputType& input);
    static void ParseControlRow(const DBRule& dbRule, MinRest7412ControlParam& control);
    bool MatchesControl(const Duty* currDuty, const Duty* nextDuty, const MinRest7412ControlParam& control) const;

    void CalculateDuty(std::vector<Duty*> duties);

};

#endif // CREWRULE_CALCULATEMINIMUMRESTPERIODFORSQRULE_H
