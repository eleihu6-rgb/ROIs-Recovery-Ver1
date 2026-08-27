/**
 * @file AcopFdpPatternRule.h
 * @brief Rule 7420 - SQ CA ACOP FDP pattern (Table A).
 */

#ifndef _ACOP_FDP_PATTERN_RULE_H_
#define _ACOP_FDP_PATTERN_RULE_H_

#include <vector>

#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"

#include "AcopFdpPatternRuleParam.h"

class AcopFdpPatternRule : public BasicRule {
public:
    using InputType = RuleInput;
    static constexpr unsigned int RuleFuncId = RULES::SQ_CA_ACOP_FDP_PATTERN_TABLE_A;
    static constexpr RuleInterface::InterfaceUnderlyingType AvailableInterface =
        RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    static constexpr ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit AcopFdpPatternRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, RuleFuncId, AvailableInterface) {
        ParseParam(input);
    }

    bool CheckRule(const Pairing* pairing) const override;
    bool CheckRule(const Duty* duty) const override;

 private:
    struct ControlParam {
        // Pairing service type filter: '*' (any), 'J' (passenger), 'F' (freighter).
        std::string serviceTypeUpper{"*"};

        // Optimizer gating: when running under optimizer, allow violations to be treated as "pass"
        // if the rule row severity (DBRule::severity) is <= this level.
        // -1 (default) => None (no bypass); 255 => Any (bypass all severities).
         int optimizerPassLevel{-1};
     };

     struct RuleInstance {
         long long ruleId{0};
         ControlParam control{};
         std::vector<AcopFdpPatternRuleParam> params{};
     };

     std::vector<RuleInstance> _ruleInstances;

     void ParseParam(const InputType& input);

     bool checkDuty(const Duty* duty,
                    const Pairing* pairing,
                    std::size_t dutyIndex,
                    const std::string& pairingServiceType,
                    const RuleInstance& instance) const;
     bool evaluateDuty(const Duty& duty, const AcopFdpPatternRuleParam& param, const ControlParam& control) const;
     bool evaluateNextDutyRestriction(const Duty& duty,
                                      const AcopFdpPatternRuleParam& param,
                                      const Pairing& pairing,
                                      std::size_t dutyIndex,
                                      const ControlParam& control) const;

    static int CountOperatingSectors(const Duty& duty);
    static int CountNonOperatingSectors(const Duty& duty);

     void reportDutyViolation(const Duty& duty,
                              const AcopFdpPatternRuleParam& param,
                              const std::string& message,
                              const std::map<std::string, std::string>& extraFields) const;

     bool shouldBypassViolationForOptimizer(const ViolationSeverity& severity, const ControlParam& control) const;
 };

#endif  // _ACOP_FDP_PATTERN_RULE_H_

