/**
 * @file CalculateAtdoAfterSlipForSQRule.h
 * @brief Rule 7422 - SQ CA ATDO after slip on return to base.
 */

#ifndef RULEENGINE_RULE7422_CALCULATEATDOAFTERSLIPFORSQRULE_H_
#define RULEENGINE_RULE7422_CALCULATEATDOAFTERSLIPFORSQRULE_H_

#include <string>
#include <vector>

#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"

#include "AtdoAfterSlipForSQRuleParam.h"

class CalculateAtdoAfterSlipForSQRule : public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7422;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface =
        RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit CalculateAtdoAfterSlipForSQRule(const RuleSystem* system, const InputType& input)
        : CalculateRule(system, RuleFuncId, AvailableInterface) {
        ParseParam(input);
    }

    ~CalculateAtdoAfterSlipForSQRule() override = default;

    void CalculateDuty(Pairing* pairing) override;
    void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:
    struct RestWindowResult {
        int minRestAtBaseMinutes{0};
        time_t restStartLoc{0};
        time_t requiredEndLoc{0};
    };

    struct RuleInstance {
        long long ruleId{0};
        Atdo7422ControlParam control{};
        std::vector<AtdoAfterSlipForSQRuleParam> params{};
    };

    std::vector<RuleInstance> _ruleInstances;

    void ParseParam(const InputType& input);

    static bool ParseControlRow(const DBRule& dbRule, Atdo7422ControlParam& control);
    static bool IsOperatingDuty(const Duty& duty, const Atdo7422ControlParam& control);
    static time_t GetRestStartLocAfterDuty(const Duty& duty, const Atdo7422ControlParam& control);
    static time_t CeilToNextMidnight(time_t tLoc, bool exactMidnightNextDay = false);
    static int ClampMinutesOfDay(int minutes);
    static int CalcDerivedAtdoDaysFromRestWindow(const RestWindowResult& restWindow,
                                                 const Atdo7422ControlParam& control);

    bool TryMatchAndCalcMinRestAtBaseMinutes(const Pairing& pairing,
                                            const AtdoAfterSlipForSQRuleParam& ruleParam,
                                            const Atdo7422ControlParam& control,
                                            RestWindowResult& outRestWindow) const;
};

#endif  // RULEENGINE_RULE7422_CALCULATEATDOAFTERSLIPFORSQRULE_H_
