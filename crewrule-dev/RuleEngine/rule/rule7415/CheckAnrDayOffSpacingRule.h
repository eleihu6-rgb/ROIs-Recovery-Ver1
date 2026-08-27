#ifndef RULEENGINE_RULE7415_CHECKANRDAYOFFSPACINGRULE_H_
#define RULEENGINE_RULE7415_CHECKANRDAYOFFSPACINGRULE_H_

#include <vector>

#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "AnrDayOffSpacingRuleParam.h"
#include "../rule7401/AnrDayOffDefinition.h"

class CheckAnrDayOffSpacingRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = RULES::ANR_DAY_OFF_SPACING;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface =
        RuleInterface::Interface::SinglePairing |
        RuleInterface::Interface::SingleCrew;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit CheckAnrDayOffSpacingRule(const RuleSystem* system,
                                       const InputType& input)
        : BasicRule(system, RuleFuncId, AvailableInterface),
          _param(this) {
        ParseParam(input);
    }
    ~CheckAnrDayOffSpacingRule() override = default;

    bool CheckRule(const Pairing* pairing) const override;
    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

    // Helper exposed for focused unit tests.
    bool TestRestContainsAnrDayOff(const Duty* duty,
                                   const Duty* nextDuty) const {
        return restContainsAnrDayOff(duty, nextDuty);
    }

private:
    enum class ViolationReason {
        ExceededLimit,
        LateBuffer
    };

    void ParseParam(const InputType& input);
    bool checkPairingInternal(const Pairing* pairing, const ROSTER* roster) const;
    bool checkPairingWithConfig(const Pairing* pairing,
                                const ROSTER* roster,
                                const AnrDayOffSpacingConfig& config) const;
    bool restContainsAnrDayOff(const Duty* duty, const Duty* nextDuty) const;
    void throwViolation(const Pairing* pairing,
                        const ROSTER* roster,
                        const Duty* duty,
                        int consecutiveDays,
                        time_t restStartUtc,
                        const AnrDayOffSpacingConfig& config,
                        ViolationReason reason) const;

    static long long dayIndexForBase(time_t utcTime, int baseOffsetMinutes);
    static int minutesFromBaseMidnight(time_t utcTime, int baseOffsetMinutes);
    time_t computeWorkingDayEndUtc(const Duty* duty,
                                   Anr7415WorkDayEndsAt mode) const;
    time_t computeRestStartUtc(const Duty* duty) const;
    time_t computeRestEndUtc(const Duty* nextDuty) const;

    AnrDayOffSpacingRuleParam _param;
    AnrDayOffDefinition _dayOffDefinition;
};

#endif  // RULEENGINE_RULE7415_CHECKANRDAYOFFSPACINGRULE_H_
