#ifndef RULEENGINE_RULE7416_CHECKANRMINDAYOFFINPERIODRULE_H_
#define RULEENGINE_RULE7416_CHECKANRMINDAYOFFINPERIODRULE_H_

#include <vector>

#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "AnrMinDayOffInPeriodRuleParam.h"
#include "../rule7401/AnrDayOffDefinition.h"

class CheckAnrMinDayOffInPeriodRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = RULES::ANR_MIN_DAYS_OFF_IN_PERIOD;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface =
        RuleInterface::Interface::SinglePairing |
        RuleInterface::Interface::SingleCrew;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit CheckAnrMinDayOffInPeriodRule(const RuleSystem* system,
                                           const InputType& input)
        : BasicRule(system, RuleFuncId, AvailableInterface),
          _param(this) {
        ParseParam(input);
    }
    ~CheckAnrMinDayOffInPeriodRule() override = default;

    bool CheckRule(const Pairing* pairing) const override;
    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:
    struct RestPeriod {
        time_t startUtc{0};
        time_t endUtc{0};
        int offsetMinutes{0};
        std::string zoneId{};
    };

    void ParseParam(const InputType& input);
    bool checkPairingInternal(const Pairing* pairing, const ROSTER* roster) const;
    bool checkPairingWithConfig(const Pairing* pairing,
                                const ROSTER* roster,
                                const AnrMinDayOffInPeriodConfig& cfg) const;
    int countAnrDaysOffInWindow(time_t windowStartUtc,
                                time_t windowEndUtc,
                                const std::vector<RestPeriod>& restPeriods,
                                int minDaysOffRequired = -1) const;
    void throwViolation(const Pairing* pairing,
                        const ROSTER* roster,
                        time_t windowStartUtc,
                        time_t windowEndUtc,
                        const AnrMinDayOffInPeriodConfig& config,
                        int daysOffInWindow) const;

    static long long dayIndexForBase(time_t utcTime, int baseOffsetMinutes);
    static time_t dayIndexToUtc(long long dayIndex, int baseOffsetMinutes);
    static time_t computeRestStartUtc(const Duty* duty);
    static time_t computeRestEndUtc(const Duty* nextDuty);

    AnrMinDayOffInPeriodRuleParam _param;
    AnrDayOffDefinition _dayOffDefinition;
};

#endif  // RULEENGINE_RULE7416_CHECKANRMINDAYOFFINPERIODRULE_H_
