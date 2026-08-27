/**
 * @file AcopSlipPatternRule.h
 * @brief Rule 7421 - SQ CA ACOP slip pattern (Template B).
 */

#ifndef _ACOP_SLIP_PATTERN_RULE_H_
#define _ACOP_SLIP_PATTERN_RULE_H_

#include <vector>
#include <map>
#include <string>
#include <functional>
#include <mutex>

#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"

#include "AcopSlipPatternRuleParam.h"
#include "../rule7405/UlrDutyDefinition.h"

class AcopSlipPatternRule : public BasicRule {
public:
    using InputType = RuleInput;
    static constexpr unsigned int RuleFuncId = RULES::SQ_CA_ACOP_SLIP_PATTERN_TABLE_B;
    static constexpr RuleInterface::InterfaceUnderlyingType AvailableInterface =
        RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    static constexpr ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit AcopSlipPatternRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, RuleFuncId, AvailableInterface) {
        ParseParam(input);
    }

    bool CheckRule(const Pairing* pairing) const override;
    bool CheckRule(const Duty* duty) const override;

  private:
    struct RuleInstance {
        long long ruleId{0};
        AcopSlipPatternControlParam control{};
        std::vector<AcopSlipPatternRuleParam> params{};
    };

    std::vector<RuleInstance> _ruleInstances;

    // Cached 7405 ULR-definition rows (used for ULR_EQUIVALENT_POS matching).
    std::vector<DBRule> _ulrDefinitionDbRules{};
    mutable std::once_flag _ulrDefinitionInitOnce{};
    mutable std::vector<ULRDutyDefinition::Row> _ulrDefinitionRows{};
    void EnsureUlrDefinitionRowsInitialized() const;

     struct ExtraDaysOffAtBaseRequirement {
         int atdoDays{0};
        const AcopSlipPatternRuleParam* atdoParam{nullptr};
        std::string atdoReason{};

        int exdoDays{0};
        const AcopSlipPatternRuleParam* exdoParam{nullptr};
        std::string exdoReason{};
    };

     void ParseParam(const InputType& input);

     bool checkSlipAtIndex(const Pairing& pairing,
                           std::size_t arriveDutyIndex,
                           const std::vector<const AcopSlipPatternRuleParam*>& applicableParams,
                           const AcopSlipPatternControlParam& control,
                           ExtraDaysOffAtBaseRequirement& extraDaysOffAtBaseRequirement,
                           const std::function<bool(const Duty&)>& isUlrEquivalentPositioningDuty) const;

     void reportDutyViolation(const Duty& duty,
                              const AcopSlipPatternRuleParam& param,
                              const std::string& message,
                              const std::map<std::string, std::string>& extraFields) const;

     bool shouldBypassViolationForOptimizer(const ViolationSeverity& severity, const AcopSlipPatternControlParam& control) const;
};

#endif  // _ACOP_SLIP_PATTERN_RULE_H_
