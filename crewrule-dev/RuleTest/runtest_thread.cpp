#include "ThreadLocal.h"
#include "InheritableThreadLocal.h"
#include "Duty.h"

#include <ostream>
#include <string>
#include <vector>
#include <thread>
#include <stdio.h>
#include <vector>
#include <iostream>

class TestDuty {

private:
	int _id{};

	ThreadLocal<unsigned int> _minRest = 1;

	ThreadLocal<std::string> _acclimatisedState = string("D");

	ThreadLocal<std::vector<std::shared_ptr<limitaions>>> _rule_limits = std::vector<std::shared_ptr<limitaions>>();

	InheritableThreadLocal<unsigned int> _actRest = 1;

	InheritableThreadLocal<std::string> _actAcclimatisedState = string("U");

public:
	void setId(int id) {
		_id = id;
	}

	int getId() {
		return _id;
	}

	void setMinRest(const unsigned int minRest) {
		_minRest.set(minRest);
	}

	unsigned int getMinRest() const {
		return _minRest.get();
	}

	void setActRest(const unsigned int actRest) {
		_actRest.set(actRest);
	}

	unsigned int getActRest() const {
		return _actRest.get();
	}


	void setAcclimatisedState(const string accState) {
		_acclimatisedState.set(accState);
	}

	string getAcclimatisedState() const {
		return _acclimatisedState.get();
	}

	ThreadLocal<unsigned int>& getMinRestThreadLocal() {
		return _minRest;
	}
};




void test_thread(std::vector<std::shared_ptr<TestDuty>>& testDuties) {
	
	try {
		TestDuty testDuty;
		testDuty.setMinRest(100);
		TestDuty testDuty2(testDuty);
		testDuty2.setMinRest(102);
		TestDuty testDuty3;
		testDuty3.setMinRest(103);
		testDuty3 = testDuty2;

		std::thread::id id = std::this_thread::get_id();
		int threadId = *(unsigned int*)&id;

		for (int i = 0; i < 100; i++) {
			//std::cout << "thread id:" << std::this_thread::get_id() << " start." << std::endl;
			std::cout << "thread id:" << threadId << " start." << std::endl;
			for (auto& testDuty : testDuties) {
				std::cout << "thread id:" << std::this_thread::get_id() << ", duty id:" << testDuty->getId() << ", threadLocal id:" << testDuty->getMinRestThreadLocal().getId() << std::endl;
				std::cout << "thread id:" << std::this_thread::get_id() << ", duty id:" << testDuty->getId() << ", minRest:" << testDuty->getMinRest() << ", actRest:" << testDuty->getActRest() << ", AccState:" << testDuty->getAcclimatisedState() << std::endl;
				testDuty->setMinRest(testDuty->getMinRest() + testDuty->getId());
				testDuty->setActRest(testDuty->getActRest() + testDuty->getId());
                std::string acc = "D" + std::to_string(testDuty->getId());
				testDuty->setAcclimatisedState(acc);
				//testDuty->setMinRest(testDuty->getMinRest() + testDuty->getId() + threadId);
				std::cout << "thread id:" << std::this_thread::get_id() << ", duty id:" << testDuty->getId() << ", modify minRest:" << testDuty->getMinRest() << ", actRest:" << testDuty->getActRest() << std::endl;
			}
			std::cout << "thread id:" << std::this_thread::get_id() << " end." << std::endl;
		}
	}
	catch (std::exception& e) {
		
		std::cout << "exception:" << e.what() << std::endl;
	}
}

constexpr int MAX_THREAD = 10;

bool test_thread_case() {
	ThreadLocal<bool> sucessed(false);
	sucessed.set(true);

	TestDuty testDuty;
	testDuty.setMinRest(100);
	TestDuty testDuty2(testDuty);
	testDuty2.setMinRest(102);
	TestDuty testDuty3;
	testDuty3.setMinRest(103);
	testDuty3 = testDuty2;

	int minRest = testDuty3.getMinRest();

	std::thread threads[MAX_THREAD];
	std::vector<std::shared_ptr<TestDuty>> testDuties;
	for (int i = 1; i < 10; i++) {
		std::shared_ptr<TestDuty> testDuty = std::make_shared<TestDuty>();
		testDuty->setId(i);
		testDuty->setMinRest(i * 1000000);
		testDuty->setActRest(i * 1000000);
		testDuties.push_back(testDuty);
	}

	//testDuty = std::make_shared<TestDuty>();
	//testDuty->setId(7);
	//testDuty->setMinRest(700);
	//testDuties.push_back(testDuty);

	// spawn 10 threads:
	for (int i = 0; i < MAX_THREAD; ++i) {
		threads[i] = std::thread(test_thread, std::ref(testDuties));
	}
	
	std::this_thread::sleep_for(std::chrono::seconds(1));
	for (auto& th : threads) th.join();

	return 0;
}

