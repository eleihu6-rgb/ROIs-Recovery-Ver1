#ifndef CompositionH
#define CompositionH

#include <vector>

using namespace std;

class Composition
{
public:
	Composition(long long compositionId, string name, int hierarchy, string airlineCode, string division, int displayOrder){
		_compositionId = compositionId;
		_name = name;
		_hierarchy = hierarchy;
		_airlineCode = airlineCode;
		_division = division;
		_displayOrder = displayOrder;
	}
	Composition(){};
	~Composition() = default;

	long long getCompositionId(){return _compositionId;}
	string getName(){return _name;}
	int getOrder(){ return _displayOrder; }
	int getHierarchy() { return _hierarchy; }
	string getAirlineCode(){return _airlineCode;}
	string getDivision() { return _division; }
private:
	long long _compositionId{};
	string _name{};
	int _hierarchy{};
	int _displayOrder{};
	string _airlineCode{};
	string _division{};
};

#endif

