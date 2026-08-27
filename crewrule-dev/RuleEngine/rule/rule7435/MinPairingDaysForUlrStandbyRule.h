/**
 * @file MinPairingDaysForUlrStandbyRule.h
 * @brief Rule 7435 - CA minimum pairing days when ULR and standby exist.
 */

#ifndef RULEENGINE_RULE7435_MINPAIRINGDAYSFORULRSTANDBYRULE_H_
#define RULEENGINE_RULE7435_MINPAIRINGDAYSFORULRSTANDBYRULE_H_

#include <string>
#include <vector>

#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MinPairingDaysForUlrStandbyRuleParam.h"

class MinPairingDaysForUlrStandbyRule : public BasicRule {
public:
    using InputType = RuleInput;
    static constexpr unsigned int RuleFuncId = RULES::SQ_CA_ULR_PAIRING_MIN_DAYS;
    static constexpr RuleInterface::InterfaceUnderlyingType AvailableInterface =
        RuleInterface::Interface::SinglePairing;
    static constexpr ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit MinPairingDaysForUlrStandbyRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, RuleFuncId, AvailableInterface) {
        ParseParam(input);
    }
    ~MinPairingDaysForUlrStandbyRule() override = default;

    bool CheckRule(const Pairing* pairing) const override;

private:
    std::vector<MinPairingDaysForUlrStandbyRuleParam> _params;

    void ParseParam(const InputType& input);
    bool EvaluatePairing(const Pairing* pairing) const;
    bool MatchesParam(const Pairing& pairing,
                      const MinPairingDaysForUlrStandbyRuleParam& param,
                      bool hasUlrDuty,
                      const std::string& baseUpper) const;
    bool HasAssignment(const Pairing& pairing,
                       const std::vector<std::string>& airports) const;
    bool HasLayoverAirport(const Pairing& pairing,
                           const std::vector<std::string>& airports) const;
    bool HasLayoverCountry(const Pairing& pairing,
                           const std::vector<std::string>& airports) const;
    bool HasUlrDuty(const Pairing& pairing) const;
    int CalculateBaseCalendarDays(const Pairing& pairing,
                                  int baseOffsetMinutes,
                                  const MinPairingDaysForUlrStandbyRuleParam& param) const;
    int GetBaseOffsetMinutes(const Pairing& pairing) const;
    std::pair<time_t, time_t> GetPairingUtcSpan(const Pairing& pairing,
                                                const MinPairingDaysForUlrStandbyRuleParam& param) const;
    void ThrowViolation(const Pairing& pairing,
                        const MinPairingDaysForUlrStandbyRuleParam& param,
                        int actualDays,
                        const std::string& baseUpper) const;
};

#endif  // RULEENGINE_RULE7435_MINPAIRINGDAYSFORULRSTANDBYRULE_H_
