/**
 * @file CalculateOvernightAtdoAtBaseForSQRule.h
 * @brief Rule 7424 - SQ overnight arrival ATDO at base.
 */

#ifndef RULEENGINE_RULE7424_CALCULATEOVERNIGHTATDOATBASEFORSQRULE_H_
#define RULEENGINE_RULE7424_CALCULATEOVERNIGHTATDOATBASEFORSQRULE_H_

#include <vector>

#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"

#include "OvernightAtdoAtBaseForSQRuleParam.h"

class CalculateOvernightAtdoAtBaseForSQRule : public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7424;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface =
        RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit CalculateOvernightAtdoAtBaseForSQRule(const RuleSystem* system, const InputType& input)
        : CalculateRule(system, RuleFuncId, AvailableInterface) {
        ParseParam(input);
    }

    ~CalculateOvernightAtdoAtBaseForSQRule() override = default;

    void CalculateDuty(Pairing* pairing) override;
    void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:
    struct RuleInstance {
        long long ruleId{0};
        Overnight7424ControlParam control{};
        std::vector<OvernightAtdoAtBaseForSQRuleParam> params{};
    };

    std::vector<RuleInstance> _ruleInstances;

    void ParseParam(const InputType& input);
    static bool ParseControlRow(const DBRule& dbRule, Overnight7424ControlParam& control);

    bool PairingMatchesServiceTypeAndFleetGroups(const Pairing& pairing,
                                                 const Overnight7424ControlParam& control) const;

    bool TryMatchAndCalcMinRestAtBaseMinutes(const Pairing& pairing,
                                             const OvernightAtdoAtBaseForSQRuleParam& ruleParam,
                                             const Overnight7424ControlParam& control,
                                             int& outMinRestAtBaseMinutes) const;
};

#endif  // RULEENGINE_RULE7424_CALCULATEOVERNIGHTATDOATBASEFORSQRULE_H_
