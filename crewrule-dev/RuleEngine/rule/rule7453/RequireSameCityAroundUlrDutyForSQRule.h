/**
 * @file RequireSameCityAroundUlrDutyForSQRule.h
 */

#ifndef _REQUIRE_SAME_CITY_AROUND_ULR_DUTY_FOR_SQ_RULE_H_
#define _REQUIRE_SAME_CITY_AROUND_ULR_DUTY_FOR_SQ_RULE_H_

#include <string>
#include <vector>

#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "RequireSameCityAroundUlrDutyForSQRuleParam.h"

class RequireSameCityAroundUlrDutyForSQRule : public BasicRule {
public:
    using InputType = RuleInput;
    static constexpr unsigned int RuleFuncId = RULES::SQ_CA_SAME_CITY_AROUND_ULR_DUTY;
    static constexpr RuleInterface::InterfaceUnderlyingType AvailableInterface =
        RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;

    explicit RequireSameCityAroundUlrDutyForSQRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, RuleFuncId, AvailableInterface) {
        ParseParam(input);
    }
    ~RequireSameCityAroundUlrDutyForSQRule() override = default;

    bool CheckRule(const Pairing* pairing) const override;
    bool CheckRule(const Duty* duty) const override;

private:
    struct AdjacentCityOccurrence {
        int dutySeq{0};
        std::string side{};
        std::string airport{};
        std::string city{};
    };

    std::vector<RequireSameCityAroundUlrDutyForSQRuleParam> _params{};

    void ParseParam(const InputType& input);
    const RequireSameCityAroundUlrDutyForSQRuleParam* FindMatchedParam(const Pairing* pairing) const;
    void ThrowViolation(const Pairing* pairing,
                        const RequireSameCityAroundUlrDutyForSQRuleParam& param,
                        const std::vector<AdjacentCityOccurrence>& occurrences) const;

    static std::string ResolveAirportCityCode(const CrewDataContext* dbData, const std::string& airport);
};

#endif // _REQUIRE_SAME_CITY_AROUND_ULR_DUTY_FOR_SQ_RULE_H_
